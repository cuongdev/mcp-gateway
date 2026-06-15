# Bảo mật

Phần Bảo mật trên dashboard MCP Gateway cung cấp cho quản trị viên khả năng giám sát và kiểm soát các quy tắc lọc dữ liệu nhạy cảm khỏi mọi yêu cầu và phản hồi MCP trước khi chúng đến upstream server hoặc client kết nối. Các quy tắc được engine redaction tích hợp sẵn đánh giá theo thời gian thực và mọi kết quả khớp đều được ghi lại dưới dạng findings để phục vụ mục đích kiểm tra.

**Các màn hình trong phần này:**

- [Redaction](#redaction)

---

## Redaction

Trang Redaction cho phép bạn quản lý các quy tắc lọc PII và thông tin bí mật mà gateway áp dụng lên tham số yêu cầu và nội dung phản hồi MCP. Mỗi quy tắc chứa một biểu thức chính quy (regex); khi mẫu khớp, engine sẽ thay thế văn bản, từ chối lệnh gọi, hoặc ghi lại một finding mà không chỉnh sửa payload — tuỳ theo chế độ đã cấu hình.

![Redaction](../images/redaction.png)

### Cách sử dụng

Trang được chia thành ba tab: **Rules** (Quy tắc), **Findings** (Kết quả tìm thấy), và **Test playground** (Bàn kiểm thử).

#### Tab Rules

1. Thẻ **Built-in rules** liệt kê các quy tắc được cài sẵn cùng gateway (ví dụ: số thẻ tín dụng, AWS access key, GitHub token). Quy tắc tích hợp không thể xoá, nhưng bạn có thể tắt một quy tắc bằng cách chuyển nút gạt trên dòng tương ứng.
2. Thẻ **Custom rules** liệt kê các quy tắc bạn đã thêm. Mỗi dòng hiển thị tên quy tắc, nhãn kind, badge chế độ, và số lần khớp trong toàn bộ vòng đời.
3. Để tạo quy tắc mới, nhấn **New custom rule**. Một bảng trượt bên phải sẽ mở ra với các trường sau:

   | Trường | Mô tả |
   |---|---|
   | `Name` | Nhãn dễ đọc hiển thị trên UI và trong findings. |
   | `Kind` | Nhãn danh mục tự do (ví dụ: `api-key`, `pii`) dùng trong bản ghi finding và placeholder thay thế `[REDACTED:<kind>]`. |
   | `Pattern` | Biểu thức chính quy ECMAScript. Gateway chạy kiểm tra safe-regex để từ chối các mẫu có thể gây backtracking thảm khốc trước khi lưu. |
   | `Mode` | Xem bảng bên dưới. |

4. Chọn **Mode** (Chế độ):

   | Chế độ | Hành vi |
   |---|---|
   | `redact` | Thay thế mọi kết quả khớp bằng `[REDACTED:<kind>]` và cho phép lệnh gọi tiếp tục. |
   | `block` | Từ chối toàn bộ lệnh gọi MCP ngay khi mẫu khớp, trả về lỗi. |
   | `warn` | Ghi finding vào audit trail nhưng cho payload đi qua nguyên vẹn. |

5. Nhấn **Create** để lưu. Quy tắc có hiệu lực ngay lập tức cho toàn bộ traffic tiếp theo.

#### Tab Findings

Tab **Findings** hiển thị nhật ký các lần khớp quy tắc được ghi trong 24 giờ qua.

1. Dùng trường **Server** để lọc findings theo upstream server cụ thể (khớp một phần).
2. Dùng trường **Rule ID** để lọc theo một quy tắc cụ thể.
3. Dùng dropdown **Scope** để lọc theo `request`, `response`, hoặc hiển thị `all`.
4. Ba **stat card** ở đầu trang hiển thị tổng số findings trong 24 giờ qua, quy tắc khớp nhiều nhất, và server có nhiều findings nhất.
5. Mỗi dòng finding hiển thị timestamp, tên quy tắc, kind, chế độ, số lần khớp, scope, và server nguồn. Nhấn vào dòng để mở rộng chi tiết.

#### Tab Test playground

Tab **Test playground** cho phép bạn quét văn bản tuỳ ý với tất cả quy tắc đang được bật mà không tạo ra traffic thực tế.

1. Dán hoặc nhập bất kỳ văn bản (hoặc JSON) nào vào vùng **Sample text**. Một mẫu tích hợp sẵn minh hoạ các định dạng bí mật phổ biến được điền sẵn.
2. Chọn **Scope** (`request` hoặc `response`) để mô phỏng tập quy tắc sẽ được áp dụng.
3. Nhấn **Scan**. Engine chạy tất cả quy tắc đang bật với đầu vào của bạn.
4. Bảng **Findings** xuất hiện bên dưới, liệt kê mọi quy tắc khớp cùng badge chế độ, kind, tên quy tắc và số lần khớp. Badge `BLOCKED` xuất hiện nếu có bất kỳ quy tắc chế độ `block` nào khớp.
5. Bảng **Redacted output** hiển thị văn bản đã được biến đổi sau khi áp dụng tất cả các thay thế theo chế độ `redact`.

### Các khái niệm

| Khái niệm | Chi tiết |
|---|---|
| `scopeRequest` / `scopeResponse` | Mỗi quy tắc có thể được giới hạn áp dụng cho request, response, hoặc cả hai. Quy tắc tích hợp sẵn cho phép cấu hình riêng; quy tắc tuỳ chỉnh tạo qua UI mặc định áp dụng cho cả hai. |
| Safe-regex check | Gateway từ chối các mẫu có thể gây backtracking thảm khốc (ReDoS), bảo vệ độ trễ của gateway. |
| Chuỗi ≥ 1 MB | Chuỗi vượt ngưỡng 1 MB sẽ bị engine bỏ qua như một biện pháp bảo vệ chi phí; sự kiện này được ghi log nhưng không làm thất bại lệnh gọi. |
| `postFilter` | Các quy tắc tích hợp sẵn có thể đính kèm bộ lọc hậu kỳ (ví dụ: kiểm tra Luhn cho số thẻ tín dụng) để loại bỏ kết quả dương tính giả trước khi ghi finding. |
| Hit count | Hiển thị bên cạnh mỗi dòng quy tắc — được lấy từ thống kê finding được lưu trữ, không phải bộ đếm trong bộ nhớ. Giá trị này tồn tại qua các lần khởi động lại gateway. |

---

## Xem thêm

- [Kiến trúc](./architecture.md)
- [Độ tin cậy](./reliability.md)
- [Quan sát](./observability.md)
- [Danh tính](./identity.md)
