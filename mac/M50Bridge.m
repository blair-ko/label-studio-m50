#import <Foundation/Foundation.h>
#import <CoreBluetooth/CoreBluetooth.h>

static NSString *const Service = @"E7810A71-73AE-499D-8C15-FAA9AEF0C3F2";
static NSString *const Characteristic = @"BEF8D6C9-9C21-4C9E-B632-BD58C1009F9F";
static const NSUInteger RasterHeaderBytes = 24;
static const NSUInteger RasterLineBytes = 14;
static const NSUInteger DotsPerMillimeter = 8;
static const NSUInteger JobEndBytes = 6;

@interface M50Bridge : NSObject <CBCentralManagerDelegate, CBPeripheralDelegate>
@property CBCentralManager *central;
@property CBPeripheral *printer;
@property CBCharacteristic *port;
@property NSData *job;
@property NSMutableData *statusBytes;
@property NSDictionary *deviceInfo;
@property NSString *error;
@property NSUInteger offset;
@property NSUInteger chunkSize;
@property NSUInteger writes;
@property NSTimeInterval transferStarted;
@property NSTimeInterval transferDuration;
@property BOOL sentJob;
@property BOOL done;
@property BOOL complete;
@property BOOL writesDone;
@property NSDate *lastWrite;
@property BOOL statusWritten;
@end

@implementation M50Bridge
- (void)fail:(NSString *)message {
    self.error = message;
    self.done = YES;
}

- (void)centralManagerDidUpdateState:(CBCentralManager *)central {
    switch (central.state) {
        case CBManagerStatePoweredOn: [central scanForPeripheralsWithServices:@[[CBUUID UUIDWithString:Service]] options:nil]; break;
        case CBManagerStateUnauthorized: [self fail:@"請在 macOS 的「隱私權與安全性 → 藍牙」允許執行本機工具的終端機使用藍牙。"]; break;
        case CBManagerStateUnsupported: [self fail:@"目前程序無法使用 Mac 的藍牙介面。"]; break;
        case CBManagerStatePoweredOff: [self fail:@"請開啟這台 Mac 的藍牙。"]; break;
        default: break;
    }
}

- (void)centralManager:(CBCentralManager *)central didDiscoverPeripheral:(CBPeripheral *)peripheral
     advertisementData:(NSDictionary<NSString *,id> *)advertisementData RSSI:(NSNumber *)RSSI {
    (void)RSSI;
    NSString *name = advertisementData[CBAdvertisementDataLocalNameKey] ?: peripheral.name;
    NSString *preferredName = NSProcessInfo.processInfo.environment[@"LABEL_STUDIO_PRINTER_NAME"];
    BOOL matchesPrinter = preferredName.length ? [name isEqualToString:preferredName] : [name hasPrefix:@"Kodak Label_"];
    if (!matchesPrinter) return;
    self.printer = peripheral;
    [central stopScan];
    [central connectPeripheral:peripheral options:nil];
}

- (void)centralManager:(CBCentralManager *)central didConnectPeripheral:(CBPeripheral *)peripheral {
    (void)central;
    peripheral.delegate = self;
    [peripheral discoverServices:@[[CBUUID UUIDWithString:Service]]];
}

- (void)centralManager:(CBCentralManager *)central didFailToConnectPeripheral:(CBPeripheral *)peripheral error:(NSError *)error {
    (void)central; (void)peripheral;
    [self fail:error.localizedDescription ?: @"無法連上標籤機。"];
}

- (void)centralManager:(CBCentralManager *)central didDisconnectPeripheral:(CBPeripheral *)peripheral error:(NSError *)error {
    (void)central; (void)peripheral; (void)error;
    if (self.writesDone) self.done = YES;
    else if (!self.done) [self fail:@"標籤機已斷線。請先查看是否已印出。"];
}

- (void)peripheral:(CBPeripheral *)peripheral didDiscoverServices:(NSError *)error {
    CBService *service = peripheral.services.firstObject;
    if (error || !service) { [self fail:@"找不到 M50 的藍牙服務。"]; return; }
    [peripheral discoverCharacteristics:@[[CBUUID UUIDWithString:Characteristic]] forService:service];
}

- (void)peripheral:(CBPeripheral *)peripheral didDiscoverCharacteristicsForService:(CBService *)service error:(NSError *)error {
    self.port = service.characteristics.firstObject;
    if (error || !self.port) { [self fail:@"找不到 M50 的藍牙收發端點。"]; return; }
    [peripheral setNotifyValue:YES forCharacteristic:self.port];
}

- (void)peripheral:(CBPeripheral *)peripheral didUpdateNotificationStateForCharacteristic:(CBCharacteristic *)characteristic error:(NSError *)error {
    if (error || !characteristic.isNotifying) { [self fail:@"無法訂閱 M50 回覆。"]; return; }
    uint8_t query[] = {0x10,0xff,0x70};
    self.statusBytes = [NSMutableData data];
    [peripheral writeValue:[NSData dataWithBytes:query length:sizeof(query)] forCharacteristic:characteristic type:CBCharacteristicWriteWithResponse];
}

- (void)writeNext {
    if (self.done) return;
    if (self.offset >= self.job.length) {
        self.writesDone = YES;
        self.transferDuration = NSProcessInfo.processInfo.systemUptime - self.transferStarted;
        self.lastWrite = [NSDate date];
        if (self.complete) self.done = YES;
        return;
    }
    NSUInteger count = MIN(self.chunkSize, self.job.length - self.offset);
    NSData *chunk = [self.job subdataWithRange:NSMakeRange(self.offset,count)];
    self.offset += count;
    self.writes++;
    [self.printer writeValue:chunk forCharacteristic:self.port type:CBCharacteristicWriteWithResponse];
}

- (void)peripheral:(CBPeripheral *)peripheral didWriteValueForCharacteristic:(CBCharacteristic *)characteristic error:(NSError *)error {
    (void)peripheral; (void)characteristic;
    if (error) { [self fail:error.localizedDescription]; return; }
    if (self.sentJob) [self writeNext];
    else {
        self.statusWritten = YES;
        [self startJobIfReady];
    }
}

- (void)peripheral:(CBPeripheral *)peripheral didUpdateValueForCharacteristic:(CBCharacteristic *)characteristic error:(NSError *)error {
    (void)peripheral;
    if (error || !characteristic.value.length || self.done) return;
    NSData *data = characteristic.value;
    if (self.sentJob) {
        const uint8_t *b=data.bytes;
        for (NSUInteger i=0; i<data.length; i++) {
            if (b[i] == 0xff) { i++; continue; }
            if (b[i] == 0xaa) self.complete = YES;
        }
        if (self.complete && self.writesDone) self.done = YES;
        return;
    }
    [self.statusBytes appendData:data];
    if (self.statusBytes.length > 512) { [self fail:@"收到的狀態格式無法辨識。"]; return; }
    NSString *status = [[NSString alloc] initWithData:self.statusBytes encoding:NSISOLatin1StringEncoding];
    NSRange modelStart = [status rangeOfString:@"M50|"];
    if (modelStart.location != NSNotFound && modelStart.location > 0) {
        status = [status substringFromIndex:modelStart.location];
    }
    NSArray<NSString *> *fields=[status componentsSeparatedByString:@"|"];
    if (fields.count < 9) return;
    NSRange stockRange=[fields[8] rangeOfString:@"^(Continuous|[0-9]+[ ]*mm)" options:NSRegularExpressionSearch];
    if (stockRange.location == NSNotFound) return;
    if (![fields[0] isEqualToString:@"M50"]) { [self fail:@"這台裝置未回報 M50 型號。"]; return; }
    self.deviceInfo=@{@"model":fields[0],@"name":fields[1],@"firmware":fields[4],@"battery":fields[6],@"state":fields[7],@"stock":[fields[8] substringWithRange:stockRange]};
    if (!self.job) {self.done = YES; return;}
    [self startJobIfReady];
}

- (BOOL)fitJobToLabel {
    NSInteger length = [self.deviceInfo[@"stock"] integerValue];
    if (length <= 0 || length >= 100) return YES;
    NSUInteger limit = (NSUInteger)length * DotsPerMillimeter * RasterLineBytes;
    NSUInteger bitmapLength = self.job.length - RasterHeaderBytes - JobEndBytes;
    if (limit >= bitmapLength) return YES;
    const uint8_t *bytes = self.job.bytes;
    for (NSUInteger i = limit; i < bitmapLength; i++) {
        if (bytes[RasterHeaderBytes + i] != 0) {
            [self fail:[NSString stringWithFormat:@"M50 量到紙長 %ld mm，這張圖稿超出可用紙長。請調整畫布或圖稿再送印。", (long)length]];
            return NO;
        }
    }
    uint16_t rows = (uint16_t)length * DotsPerMillimeter;
    NSMutableData *job = [NSMutableData dataWithBytes:bytes length:RasterHeaderBytes + limit];
    uint8_t *header = job.mutableBytes;
    header[22] = rows & 0xff;
    header[23] = rows >> 8;
    // Preserve the one gap advance following the printed raster.
    [job appendBytes:bytes + RasterHeaderBytes + bitmapLength length:JobEndBytes];
    self.job = job;
    return YES;
}

- (void)startJobIfReady {
    if (!self.statusWritten || !self.deviceInfo || !self.job || self.sentJob) return;
    if (![self.deviceInfo[@"state"] isEqualToString:@"ready"]) { [self fail:@"M50 尚未就緒。請檢查上蓋與紙捲。"]; return; }
    if (![self fitJobToLabel]) return;
    // The no-response maximum is the negotiated single-packet payload. A
    // larger acknowledged write can turn into a queued ATT long write.
    NSUInteger packet = [self.printer maximumWriteValueLengthForType:CBCharacteristicWriteWithoutResponse];
    NSUInteger acknowledged = [self.printer maximumWriteValueLengthForType:CBCharacteristicWriteWithResponse];
    self.chunkSize = MIN(packet, acknowledged);
    if (self.chunkSize == 0) { [self fail:@"無法取得 M50 可接收的藍牙封包大小。"]; return; }
    self.sentJob = YES;
    self.transferStarted = NSProcessInfo.processInfo.systemUptime;
    [self writeNext];
}
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        M50Bridge *bridge = [M50Bridge new];
        if (argc == 3 && !strcmp(argv[1],"print")) {
            bridge.job = [NSData dataWithContentsOfFile:@(argv[2])];
            if (bridge.job.length < 44 || bridge.job.length > 11230) return 2;
        } else if (argc != 2 || strcmp(argv[1],"status")) {
            return 2;
        }
        bridge.central = [[CBCentralManager alloc] initWithDelegate:bridge queue:nil];
        NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:bridge.job ? 38 : 12];
        while (!bridge.done && [deadline timeIntervalSinceNow] > 0 && (!bridge.lastWrite || -bridge.lastWrite.timeIntervalSinceNow < 9)) {
            [[NSRunLoop mainRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:.08]];
        }
        [bridge.central stopScan];
        if (bridge.printer) [bridge.central cancelPeripheralConnection:bridge.printer];
        if (!bridge.done && !bridge.writesDone) {
            [bridge fail:bridge.sentJob ? @"等候列印完成回覆逾時。請先確認機器是否已印出。" : @"找不到 M50 或查詢逾時。請確認機器開啟、靠近 Mac，且 iPhone 未連著它。"];
        }
        NSDictionary *output = bridge.error ? @{@"error":bridge.error} : bridge.deviceInfo;
        if (!bridge.error && bridge.job) {
            output = @{
                @"sent": @YES,
                @"printed": @(bridge.complete),
                @"transfer_ms": @((NSUInteger)(bridge.transferDuration * 1000)),
                @"packet_bytes": @(bridge.chunkSize),
                @"writes": @(bridge.writes)
            };
        }
        NSData *json = [NSJSONSerialization dataWithJSONObject:output options:0 error:NULL];
        fwrite(json.bytes,1,json.length,stdout); puts("");
        return bridge.error ? 1 : 0;
    }
}
