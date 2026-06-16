# Hướng dẫn MCP Gateway (Tiếng Việt)

> 🇬🇧 Need English? [Read the English guide](../en/README.md)

Chào mừng đến với wiki MCP Gateway. MCP Gateway là một proxy và control-plane
cho các máy chủ **Model Context Protocol (MCP)**: nó đứng trước các máy chủ MCP
thượng nguồn của bạn và bổ sung định danh, phân quyền, độ tin cậy, bảo mật và
khả năng quan sát — tất cả điều khiển từ bảng điều khiển quản trị (admin
dashboard) phục vụ tại `/dashboard`.

![Bảng điều khiển MCP Gateway](../images/overview.png)

## Bắt đầu từ đây

1. **[Bắt đầu](./getting-started.md)** — cài đặt, cấu hình, build và chạy gateway; mở dashboard.
2. **[Kiến trúc & Khái niệm](./architecture.md)** — proxy hoạt động ra sao, luồng xử lý request, và các thành phần cốt lõi.

## Hướng dẫn theo tính năng

Dashboard nhóm các tính năng thành các mục dưới đây. Mỗi hướng dẫn đi qua từng
màn hình kèm ảnh chụp và các bước thao tác chi tiết.

| Mục | Các màn hình |
|---|---|
| **[Servers & Tools](./servers-and-tools.md)** | Catalog · Servers · Tools · Tool Groups · Resources · Virtual Tools · Prompts · Proxies |
| **[Identity](./identity.md)** | Users · MCP Clients · My Tokens · OIDC Providers · Policies |
| **[Reliability](./reliability.md)** | Circuits · Rate Limit · Quota · Cache · Approvals |
| **[Security](./security.md)** | Redaction |
| **[Observability](./observability.md)** | Usage · Audit · Sampling Log · Metrics · Health |
| **[System](./system.md)** | Tenants · Webhooks · Settings |

## Tham khảo nhanh

- **Chạy:** `npm install && npm run build && npm start`, rồi mở `http://localhost:3100/dashboard`.
- **Chế độ:** `development` (mở, có nút dev-login) so với `enterprise` (OIDC + auth nghiêm ngặt) — xem [Bắt đầu](./getting-started.md).
- **Cấu hình:** `config/gateway.config.json` cùng các biến môi trường ghi đè — xem [Bắt đầu](./getting-started.md).

---

_Ảnh chụp màn hình được lấy từ dashboard thật qua `web/playwright.shots.config.ts`._
