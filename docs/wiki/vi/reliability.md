# Độ tin cậy

Nhóm tính năng Độ tin cậy (Reliability) trên dashboard MCP Gateway cung cấp năm cơ chế bảo vệ gateway, các MCP server upstream và các client gọi vào. Cùng nhau, chúng tạo thành một lớp phòng thủ nhiều tầng: circuit breaker ngăn lỗi lan truyền ở cấp server; rate limit và quota giới hạn mức tiêu thụ theo từng principal; cache giảm số lần gọi upstream trùng lặp; và luồng phê duyệt chặn các lệnh gọi tool nhạy cảm trước khi chúng được thực thi.

**Các màn hình trong nhóm này:**

- [Circuits](#circuits) — trạng thái circuit breaker theo từng server
- [Rate Limit](#rate-limit) — chính sách giới hạn tốc độ và các quy tắc hiện tại
- [Quota](#quota) — hạn mức gọi tool theo ngày và theo tháng của principal hiện tại
- [Cache](#cache) — quản lý và xóa cache phản hồi tool
- [Approvals](#approvals) — phê duyệt thủ công (human-in-the-loop) cho các lệnh gọi tool nhạy cảm

---

## Circuits

Màn hình Circuits hiển thị trạng thái circuit breaker của mọi MCP server mà gateway đã liên lạc. Circuit breaker ngăn gateway liên tục gửi yêu cầu đến một upstream đang lỗi: khi tỷ lệ lỗi hoặc số lỗi liên tiếp của một server vượt ngưỡng cấu hình, circuit sẽ chuyển sang `circuit_open` và các lệnh gọi tiếp theo sẽ thất bại ngay lập tức (fail-fast) cho đến khi hết thời gian cooldown và một lần thăm dò half-open thành công.

![Màn hình Circuits](../images/circuits.png)

### Cách sử dụng

1. Mở **Reliability > Circuits** trên thanh điều hướng bên trái.
2. Dùng thanh bộ lọc ở trên để thu hẹp kết quả theo trạng thái: **All**, **Open**, **Degraded**, **Healthy**, hoặc **Disabled**. Mỗi nút hiển thị số lượng server đang ở trạng thái đó.
3. Tìm thẻ server cần xem và click vào để mở **detail sheet** bên phải.
4. Trong detail sheet, xem badge **Current state** và ghi chú `lastTransitionReason` bên dưới.
5. Quan sát biểu đồ sparkline **Recent calls** để thấy cửa sổ cuộn (rolling window) của các lần gọi thành công và thất bại.
6. Để ghi đè cấu hình circuit breaker cho server đó, điền một hoặc nhiều trường trong phần **Config override** rồi nhấn **Save config override**.
7. Dùng **Manual actions** để can thiệp trực tiếp:
   - **Trip** — buộc circuit chuyển sang `circuit_open` ngay lập tức (khả dụng khi circuit chưa ở trạng thái open hoặc quarantined).
   - **Close** — đưa circuit về `healthy` (khả dụng khi trạng thái là `circuit_open`, `quarantined`, hoặc `manual_disabled`).
   - **Reset counters** — xóa toàn bộ cửa sổ cuộn và đếm lỗi liên tiếp; trạng thái trở về `healthy`. Một hộp thoại xác nhận sẽ hiện ra trước khi thực thi.

### Tham chiếu trạng thái

| Trạng thái | Ý nghĩa |
|---|---|
| `healthy` | Yêu cầu đi qua bình thường; bộ đếm lỗi đang tích lũy |
| `degraded` | Tỷ lệ lỗi hoặc số lỗi liên tiếp đang tăng nhưng chưa đạt ngưỡng trip |
| `circuit_open` | Tất cả yêu cầu thất bại ngay (fail-fast); gateway chờ hết cooldown trước khi thăm dò |
| `half_open` | Cooldown đã hết; một yêu cầu thăm dò duy nhất được phép để kiểm tra upstream |
| `quarantined` | Circuit đã mở lại nhiều hơn `quarantineAfterReopens` lần; giữ nguyên trạng thái open cho đến khi admin đóng thủ công |
| `manual_disabled` | Quản trị viên đã tắt server này qua dashboard |

### Các trường cấu hình

| Trường | Mặc định | Mô tả |
|---|---|---|
| `errorRateThreshold` | `0.5` | Tỷ lệ lần gọi thất bại trong cửa sổ cuộn cần đạt để trip circuit (0–1) |
| `windowSize` | `20` | Số lần gọi gần nhất được theo dõi trong cửa sổ cuộn |
| `consecutiveErrorsToTrip` | `5` | Số lỗi liên tiếp trip circuit bất kể tỷ lệ lỗi |
| `cooldownMs` | `30000` | Thời gian chờ (ms) ở trạng thái `circuit_open` trước khi thăm dò half-open |
| `halfOpenProbes` | `1` | Số lần gọi thăm dò được phép ở trạng thái `half_open` |
| `quarantineAfterReopens` | `3` | Số lần circuit được phép mở lại trước khi vào trạng thái `quarantined` |
| `warmupCalls` | `5` | Số lần gọi tối thiểu trước khi tỷ lệ lỗi được đánh giá |
| `probeMethod` | `tools/list` | MCP method dùng làm thăm dò sức khỏe ở trạng thái half-open |

> **Lưu ý:** Circuit breaker khởi tạo theo yêu cầu (lazily) sau lần gọi đầu tiên đến từng upstream server. Một gateway mới sẽ hiển thị danh sách trống cho đến khi có ít nhất một lệnh gọi được proxy.

---

## Rate Limit

Màn hình Rate Limit hiển thị cấu hình giới hạn tốc độ đang hoạt động của gateway — trạng thái bật/tắt, backend lưu trữ, giới hạn mặc định và các quy tắc ghi đè theo từng principal hoặc tool. Giới hạn tốc độ kiểm soát số yêu cầu một người dùng có thể thực hiện trong một khoảng thời gian, bảo vệ upstream khỏi các đợt bùng phát và đảm bảo phân phối tài nguyên công bằng giữa tất cả client.

![Màn hình Rate Limit](../images/rate-limit.png)

### Cách sử dụng

1. Mở **Reliability > Rate Limit** trên thanh điều hướng bên trái.
2. Thẻ **Status** hiển thị ba trường chỉ đọc:
   - **Enabled** — rate limiting có đang hoạt động cho instance gateway này không.
   - **Backend** — backend lưu trữ đang dùng (`memory` hoặc `redis`).
   - **Default limit** — giới hạn áp dụng cho mọi caller không khớp quy tắc nào (định dạng: `N/sec`, `N/min`, `N/hour`, hoặc `N/day`).
3. Thẻ **Rules** liệt kê mọi quy tắc ghi đè đã cấu hình. Mỗi dòng cho thấy phạm vi áp dụng và giới hạn hiệu lực:
   - Badge `principalType` (`user`, `service_account`, hoặc `mcp_client`) giới hạn theo loại principal.
   - Mã `principalId` giới hạn cho một caller cụ thể.
   - Tiền tố `tool:` chỉ ra quy tắc chỉ áp dụng cho các lệnh gọi đến tool đó (hỗ trợ ký tự đại diện `*`).
   - Giới hạn bên phải mũi tên (`→`) là mức cap hiệu lực cho các caller khớp.
4. Nếu thẻ **Rules** hiển thị "No per-principal or per-tool overrides", mọi caller đều dùng giới hạn mặc định.

> **Lưu ý:** Các quy tắc rate limit được cấu hình trong file cấu hình của gateway, không phải qua UI dashboard. Màn hình này chỉ là chế độ xem chỉ đọc của cấu hình đang chạy. Để thay đổi giới hạn, hãy cập nhật file cấu hình và tải lại gateway.

### Định dạng giới hạn

Giới hạn dùng định dạng `N/unit` trong đó `unit` là một trong `sec`, `min`, `hour`, hoặc `day`. Ví dụ, `100/min` cho phép 100 lệnh gọi mỗi phút. Quy tắc khớp cụ thể nhất sẽ thắng; `principalId` có độ ưu tiên cao hơn `principalType`.

---

## Quota

Màn hình Quota hiển thị mức sử dụng lệnh gọi tool theo ngày và theo tháng của principal hiện tại so với giới hạn quota đã cấu hình. Trong khi rate limiting áp đặt tốc độ yêu cầu trong từng cửa sổ thời gian, quota áp đặt ngưỡng sử dụng tuyệt đối và được đặt lại theo ranh giới lịch (nửa đêm UTC với quota ngày; ngày đầu tiên của tháng UTC với quota tháng).

![Màn hình Quota](../images/quota.png)

### Cách sử dụng

1. Mở **Reliability > Quota** trên thanh điều hướng bên trái.
2. Hai thẻ được hiển thị song song: **Daily** (hàng ngày) và **Monthly** (hàng tháng).
3. Mỗi thẻ hiển thị:
   - Số lệnh gọi tool **đã dùng** trong kỳ hiện tại (hiển thị dạng `used / limit`).
   - Thanh tiến trình có màu: xanh lá khi dưới 70 %, vàng từ 70–89 %, đỏ từ 90 % trở lên.
   - `/ unlimited` nếu không có giới hạn nào được cấu hình cho kỳ đó.
4. Nếu endpoint trả về lỗi hoặc phiên hiện tại chưa xác thực, trạng thái trống sẽ hiển thị thay thế.

> **Lưu ý:** Màn hình Quota phản ánh mức sử dụng của principal đã xác thực hiện tại (danh tính sử dụng API token để mở phiên dashboard). Màn hình không hiển thị quota của các principal khác. Để kiểm tra hoặc ghi đè quota cho principal cụ thể, hãy chỉnh sửa file cấu hình gateway.

### Lịch đặt lại

| Kỳ | Đặt lại vào |
|---|---|
| Hàng ngày | Nửa đêm UTC mỗi ngày |
| Hàng tháng | 00:00 UTC ngày đầu tiên của tháng tiếp theo |

---

## Cache

Màn hình Cache cho phép quản trị viên xóa các mục trong cache phản hồi tool. Cache lưu trữ kết quả của các lệnh gọi tool xác định (deterministic) được đánh khóa theo tên tool, đối số và principal gọi, để các lệnh gọi lặp lại giống hệt nhau được phục vụ từ cache mà không cần gọi upstream. Điều này giảm độ trễ và giảm tải cho upstream.

![Màn hình Cache](../images/cache.png)

### Cách sử dụng

1. Mở **Reliability > Cache** trên thanh điều hướng bên trái.
2. Trong thẻ **Invalidate**, nhập một hoặc cả hai bộ lọc sau:
   - **Tool (canonical name)** — tên đầy đủ của tool (ví dụ: `db__query`). Tất cả các mục cache của tool này trên mọi principal sẽ bị xóa.
   - **Principal ID** — ID của một caller cụ thể (ví dụ: `usr_xxx`, `sa_xxx`, hoặc `mc_xxx`). Tất cả các mục cache được tạo bởi principal này sẽ bị xóa.
3. Nhấn **Invalidate cache**. Nút bị vô hiệu hóa cho đến khi ít nhất một trường có giá trị.
4. Khi thành công, một thông báo toast xác nhận số mục đã bị xóa.

> **Mẹo:** Bạn có thể nhập cả tên tool lẫn principal ID cùng lúc. Các mục khớp với bất kỳ bộ lọc nào đều sẽ bị xóa (hợp nhất, không phải giao nhau).

### Các backend cache

Gateway hỗ trợ ba backend cache, được chọn tại thời điểm cấu hình:

| Backend | Mô tả |
|---|---|
| `memory` | Bản đồ trong tiến trình kiểu LRU; các mục sẽ mất khi khởi động lại. Có thể cấu hình qua `maxEntries`. |
| `sql` | Các mục lưu trong cơ sở dữ liệu libSQL/SQLite của gateway; tồn tại qua các lần khởi động lại. |
| `redis` | Các mục lưu trong Redis; tồn tại qua các lần khởi động lại và được chia sẻ giữa các replica gateway. |

Các mục cache tự động hết hạn sau `defaultTtlSec` giây (cấu hình phía gateway). Dùng thao tác Invalidate để xóa ngay lập tức, có mục tiêu, trước khi TTL hết hạn.

---

## Approvals

Màn hình Approvals hiển thị các yêu cầu phê duyệt thủ công đang chờ xử lý cho các lệnh gọi tool nhạy cảm. Khi một chính sách yêu cầu phê duyệt trước khi một tool thực thi, gateway giữ lệnh gọi ở trạng thái chờ và hiển thị nó trên dashboard. Quản trị viên xem xét chi tiết lệnh gọi và phê duyệt hoặc từ chối. Luồng phê duyệt đóng vai trò là cơ chế kiểm soát con người (human-in-the-loop) cho các thao tác có tác động cao hoặc không thể đảo ngược.

![Màn hình Approvals](../images/approvals.png)

### Cách sử dụng

1. Mở **Reliability > Approvals** trên thanh điều hướng bên trái. Trang tự động làm mới mỗi 10 giây và khi cửa sổ được kích hoạt.
2. Mỗi yêu cầu đang chờ được hiển thị dưới dạng một thẻ gồm:
   - **Tên tool** (dạng `monospace`) và badge trạng thái `status` hiện tại.
   - **Principal ID** đã yêu cầu lệnh gọi và thời gian còn lại trước khi yêu cầu hết hạn.
   - Khối **đối số** có thể thu gọn — nhấn "View args" để mở rộng các đối số JSON sẽ được truyền vào tool.
3. Tùy chọn nhập lý do vào ô văn bản **Optional reason**.
4. Nhấn **Approve** (dấu tick xanh) để cho phép lệnh gọi tool tiến hành, hoặc **Reject** (dấu X đỏ) để từ chối. Cả hai hành động yêu cầu phiên hiện tại phải được xác thực.
5. Khi thành công, một toast xác nhận quyết định và thẻ biến mất khỏi danh sách đang chờ.
6. Nếu không có yêu cầu phê duyệt nào đang chờ, trạng thái trống sẽ hiển thị. Yêu cầu phê duyệt chỉ được tạo ra khi lưu lượng MCP thực tế kích hoạt chính sách yêu cầu phê duyệt — một gateway mới sẽ hiển thị danh sách trống.

### Các trường của yêu cầu phê duyệt

| Trường | Mô tả |
|---|---|
| `id` | Định danh yêu cầu phê duyệt duy nhất (tiền tố `app_`) |
| `tool` | Tên chuẩn (canonical) của tool đang chờ phê duyệt |
| `principalId` | ID của caller đã kích hoạt yêu cầu phê duyệt |
| `argsJson` | Đối số được JSON-serialize sẽ được truyền vào tool |
| `status` | `pending` khi đang chờ quyết định |
| `tsExpires` | Unix timestamp (ms) sau khi yêu cầu không còn có thể xử lý |

> **Lưu ý:** API hiện chỉ hỗ trợ lọc theo `status=pending`. Các bản ghi đã phê duyệt và đã từ chối được lưu trong cơ sở dữ liệu cho mục đích kiểm tra và có thể xem trong Audit log.

---

## Xem thêm

- [Kiến trúc](./architecture.md)
- [Servers & Tools](./servers-and-tools.md)
- [Bảo mật](./security.md)
- [Khả năng quan sát](./observability.md)
