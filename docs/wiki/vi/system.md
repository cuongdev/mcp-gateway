# Hệ thống

Phần **System** của dashboard MCP Gateway bao gồm các tác vụ vận hành ảnh hưởng toàn bộ deployment: cô lập tenant, outbound webhook cho sự kiện, và chế độ xem read-only cấu hình gateway đang chạy.

**Các màn hình trong phần này:**

- [Tenants](#tenants) — tạo và quản lý các workspace riêng biệt
- [Webhooks](#webhooks) — đăng ký callback HTTP outbound cho các sự kiện gateway
- [Settings](#settings) — xem cấu hình runtime hiện tại (chỉ dành cho admin)

---

## Tenants

Màn hình Tenants cho phép quản trị viên cấp phát và quản lý các workspace riêng biệt trong gateway. Mỗi tenant có principal, server và policy riêng; tenant tích hợp sẵn `tnt_default` luôn tồn tại và không thể xoá.

![Màn hình Tenants](../images/tenants.png)

### Cách sử dụng

1. Điều hướng đến **System → Tenants** trên thanh sidebar.
2. Bảng hiển thị tất cả tenant với các cột **Slug**, **Name**, **Plan** và **Status** (`active` hoặc `suspended`).
3. Để tạo tenant, nhấn **New Tenant** (góc trên bên phải). Một slide-out sheet mở ra với các trường sau:

   | Trường | Mô tả |
   |---|---|
   | `Slug` | Định danh cố định, thân thiện URL — chỉ gồm chữ thường, số và dấu gạch ngang, ví dụ `acme-corp`. Phải là duy nhất. |
   | `Display Name` | Nhãn hiển thị thân thiện trong bảng. |
   | `Plan` | Tuỳ chọn. Nhãn văn bản tự do để truyền đạt thông tin gói dịch vụ (ví dụ `free`, `enterprise`). |

4. Nhấn **Create** để xác nhận. Gateway tự động tạo sẵn các quy tắc redaction tích hợp cho tenant mới.
5. Để xem hoặc quản lý một tenant, nhấn vào hàng của nó. Một detail sheet mở ra hiển thị `slug`, `plan`, `status` hiện tại và JSON `metadata` được lưu trên bản ghi.
6. Trong phần **Lifecycle** của detail sheet:
   - Nếu tenant đang `active`, nhấn **Suspend tenant** (nút đỏ) để chặn mọi request từ principal của tenant đó.
   - Nếu tenant đang `suspended`, nhấn **Resume tenant** để khôi phục quyền truy cập.

> **Lưu ý:** Không có hành động xoá tenant. Hãy suspend tenant để ngăn truy cập mà không cần xoá dữ liệu.

### API endpoints

| Phương thức | Đường dẫn | Mô tả |
|---|---|---|
| `GET` | `/api/tenants` | Liệt kê tất cả tenant |
| `POST` | `/api/tenants` | Tạo tenant mới |
| `PATCH` | `/api/tenants/:id/suspend` | Suspend một tenant |
| `PATCH` | `/api/tenants/:id/resume` | Resume một tenant |

---

## Webhooks

Màn hình Webhooks cho phép bạn đăng ký các callback HTTP outbound mà gateway sẽ gọi mỗi khi một sự kiện đã cấu hình xảy ra. Gateway gửi payload sự kiện qua `POST` và tuỳ chọn ký mỗi request bằng chữ ký HMAC-SHA256 để endpoint của bạn có thể xác minh tính xác thực.

![Màn hình Webhooks](../images/webhooks.png)

### Cách sử dụng

1. Điều hướng đến **System → Webhooks** trên thanh sidebar.
2. Các webhook đã đăng ký hiển thị dưới dạng card với **Name**, **URL**, badge enabled/disabled, badge tên sự kiện đã đăng ký và trạng thái ký HMAC.
3. Để đăng ký webhook, nhấn **New Webhook**. Một slide-out sheet mở ra với các trường:

   | Trường | Mô tả |
   |---|---|
   | `Name` | Nhãn dễ đọc cho webhook này. |
   | `URL` | Endpoint HTTPS mà gateway sẽ gửi `POST` sự kiện đến. |
   | `Events` | Một hoặc nhiều tên sự kiện để đăng ký (chip input có autocomplete). Để trống để nhận tất cả sự kiện. |
   | `Secret` | Tuỳ chọn. Khi cung cấp, gateway ký body request bằng HMAC-SHA256 và gửi chữ ký trong header `X-MCP-Signature` theo định dạng `sha256=<hex>`. |

4. Nhấn **Create** để lưu. Webhook được kích hoạt ngay lập tức.
5. Để xoá webhook, nhấn biểu tượng thùng rác trên card và xác nhận dialog. Các sự kiện sau đó sẽ không còn được gửi đến URL đó nữa.

### Các loại sự kiện

| Tên sự kiện | Kích hoạt khi |
|---|---|
| `approval.requested` | Một lời gọi tool bị giữ lại để phê duyệt thủ công |
| `approval.approved` | Yêu cầu phê duyệt được chấp thuận |
| `approval.rejected` | Yêu cầu phê duyệt bị từ chối |
| `approval.expired` | Yêu cầu phê duyệt hết thời gian chờ |
| `tool.called` | Một lời gọi tool được proxy qua gateway |
| `quota.exceeded` | Một principal vượt quá giới hạn call quota |
| `server.state.changed` | Trạng thái circuit breaker thay đổi |
| `redaction.block` | Một quy tắc redaction chặn lời gọi MCP |
| `catalog.installed` | Một server từ catalog được cài đặt |
| `catalog.uninstalled` | Một server từ catalog bị gỡ cài đặt |
| `virtual-tool.changed` | Một virtual tool được tạo hoặc cập nhật |

### Xác minh chữ ký HMAC

Khi `Secret` được cấu hình, hãy xác minh request đến trên endpoint của bạn:

```
X-MCP-Signature: sha256=<hex-digest>
```

Tính `HMAC-SHA256(secret, raw-request-body)` và so sánh. Từ chối mọi request mà chữ ký không khớp.

### Cơ chế retry

Dispatcher sẽ retry các lần gửi thất bại với back-off theo cấp số mũ cho đến số lần thử tối đa đã cấu hình. Kết quả gửi được lưu trữ để gateway có thể tiếp tục retry sau khi khởi động lại.

### API endpoints

| Phương thức | Đường dẫn | Mô tả |
|---|---|---|
| `GET` | `/api/webhooks` | Liệt kê tất cả webhook |
| `GET` | `/api/webhooks/events` | Liệt kê các tên sự kiện đã biết |
| `POST` | `/api/webhooks` | Tạo webhook mới |
| `DELETE` | `/api/webhooks/:id` | Xoá webhook |

---

## Settings

Màn hình Settings hiển thị snapshot read-only của cấu hình gateway đang chạy. Màn hình này yêu cầu quyền `admin`: người dùng không có vai trò `admin` sẽ thấy trạng thái "unavailable" thay vào đó. Để thay đổi cấu hình, hãy chỉnh sửa file config của gateway và khởi động lại tiến trình.

![Màn hình Settings](../images/settings.png)

### Cách sử dụng

1. Điều hướng đến **System → Settings** trên thanh sidebar.
2. Card **Runtime** ở đầu trang hiển thị metadata cấp tiến trình:

   | Trường | Mô tả |
   |---|---|
   | `Version` | Chuỗi phiên bản gateway đang triển khai. |
   | `Started at` | Timestamp ISO ghi lại thời điểm tiến trình gateway khởi động. |
   | `Mode` | Chế độ vận hành (ví dụ `standalone`, `cluster`). |

3. Bên dưới card Runtime, mỗi phần cấu hình hiển thị dưới dạng một card riêng với block JSON. Các phần được hiển thị phụ thuộc vào những key có trong config đã tải:

   | Phần | Nội dung |
   |---|---|
   | `gateway` | Cấu hình HTTP listener lõi |
   | `auth` | Cấu hình authentication provider |
   | `authorization` | Cấu hình kiểm soát truy cập theo vai trò |
   | `storage` | Cấu hình database adapter |
   | `rateLimit` | Quy tắc rate-limit theo từng principal |
   | `quota` | Cấu hình call quota |
   | `cache` | Cấu hình response cache |
   | `approval` | Cấu hình phê duyệt thủ công |
   | `webhooks` | Cấu hình webhook dispatcher |
   | `tracing` | Cấu hình OpenTelemetry / tracing |
   | `openapi` | Cấu hình hiển thị OpenAPI spec |
   | `proxy` | Cấu hình outbound HTTP/SOCKS5 proxy |
   | `tenancy` | Cấu hình multi-tenancy |
   | `oidcProviders` | Định nghĩa OIDC provider |

4. Tất cả các trường bí mật (ví dụ `clientSecret`, token, mật khẩu) được thay thế bằng `***` bởi hàm `redactConfig` trước khi gửi đến trình duyệt.

> **Mẹo:** Nếu bạn thấy trạng thái "Settings unavailable", tài khoản của bạn không có vai trò `admin`, hoặc endpoint `/api/system/info` không phản hồi.

### API endpoint

| Phương thức | Đường dẫn | Mô tả |
|---|---|---|
| `GET` | `/api/system/info` | Trả về cấu hình runtime đã redact — chỉ dành cho admin |

---

## Xem thêm

- [Architecture](./architecture.md)
- [Identity](./identity.md)
- [Observability](./observability.md)
- [Servers & Tools](./servers-and-tools.md)
