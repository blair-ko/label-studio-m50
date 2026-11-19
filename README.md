# Label Studio · Kodak M50 標籤編輯器

[開啟 GitHub Pages 版 Label Studio](https://blair-ko.github.io/label-studio-m50/)

在 Mac 的 Finder 裡雙擊 **開啟 Label Studio.command**。它會編譯本機藍牙小工具、啟動工作室並在預設瀏覽器開啟。保留終端機視窗即可繼續使用；關閉視窗或按 Control-C 可停止。也可以在終端機從此專案執行：

```sh
./開啟\ Label\ Studio.command
```

本機模式使用 macOS 的 Core Bluetooth，Safari 也能列印。請將標籤機開機並靠近 Mac，並在系統詢問時允許終端機使用藍牙。如果附近有多台 M50，請在 `mac/printer-name.local` 填入要連線的完整藍牙廣播名稱（一行），或設定 `LABEL_STUDIO_PRINTER_NAME` 環境變數，再啟動本機工具。辨識名稱以 `Kodak Label_` 開頭。本機伺服器只聽 `127.0.0.1`。

靜態網頁在 `dist/`。GitHub Pages 版可在支援 Web Bluetooth 的電腦版 Chrome 或 Edge 選「連接 M50」再「搜尋附近的 M50」。如果沒有出現裝置選單，連線視窗可直接開啟 Mac 本機版，也能下載這張設計檔到本機版匯入。iPhone Safari 可編輯及匯出設計檔。

在畫布上方的縮圖清單新增、複製或切換標籤。每張有自己的名稱、尺寸和圖層，整個專案會自動儲存在目前瀏覽器。可以下載目前這張或整個專案，匯入的標籤會加入目前的專案。從本機版移到 GitHub Pages 版時，可先下載整個專案，再到網頁版匯入。

設計尺寸為長度 10–100 mm、高度 5–14 mm。較窄的設計會在 14 mm 印頭內置中。選擇預切紙時，應使用與紙捲相符的尺寸。點陣輸出採 8 點/mm。列印對話框每次最多送一張，收到裝置回報才會顯示「已確認完成」。只收到資料寫入回覆時，會請你確認是否已出紙。

傳輸基於實機測過的 GATT 端點與 [M50 列印協議](https://github.com/richard-britton/m50-label-bench/blob/main/docs/PROTOCOL.md)。

繁中圓體使用 [justfont Huninn 粉圓](https://github.com/justfont/Huninn)，並以 [opentype.js 1.3.4](https://github.com/opentypejs/opentype.js) 轉為字形輪廓。兩者的授權文件都在 `dist/font-assets/`。
