# Servers & Tools (Máy chủ & Công cụ)

Nhóm sidebar **Servers & Tools** là trung tâm vận hành của MCP Gateway. Tại đây bạn có thể đăng ký các máy chủ MCP upstream, kiểm soát toàn bộ những gì chúng cung cấp — công cụ, tài nguyên và prompt — cũng như tạo các khả năng mới bằng virtual tools và tool groups. Bạn cũng có thể quản lý các proxy HTTP/SOCKS5 outbound dùng để kết nối đến các upstream đó.

**Các màn hình trong phần này:**

- [Catalog](#catalog)
- [Servers](#servers)
- [Tools](#tools)
- [Tool Groups](#tool-groups)
- [Resources](#resources)
- [Virtual Tools](#virtual-tools)
- [Prompts](#prompts)
- [Proxies](#proxies)

---

## Catalog

![Màn hình Catalog](../images/catalog.png)

Màn hình Catalog cung cấp khả năng cài đặt một cú nhấp chuột các connector template có sẵn cho các máy chủ MCP phổ biến như GitHub, Postgres, Slack và nhiều hơn nữa. Mỗi template đi kèm với cấu hình transport, các biến môi trường cần thiết và khai báo khả năng, giúp bạn đăng ký máy chủ mới mà không cần viết cấu hình thủ công.

### Cách sử dụng

1. Mở **Catalog** trên thanh sidebar. Tab **Browse** được hiển thị mặc định.
2. Dùng **ô tìm kiếm** để lọc theo tên hoặc ID connector, và dùng **bộ chọn danh mục** để thu hẹp danh sách theo một trong các nhóm: `All`, `Developer`, `Databases`, `Productivity`, `Cloud`, `AI/ML`, `Comms`, hoặc `Local`.
3. Nhấp **Install** trên thẻ connector bất kỳ để mở Install Wizard.
4. Trong bước **Configure** của wizard (bước 1/3):
   - Đặt **Server name** — đây là định danh được dùng xuyên suốt gateway.
   - Điền đầy đủ các **biến môi trường bắt buộc** (biến bí mật được đánh dấu bằng biểu tượng khóa; giá trị bị ẩn).
   - Bật/tắt các switch trong phần **Options** theo nhu cầu.
5. Nhấp **Preview** để xem lại cấu hình JSON sẽ được gửi đi (giá trị bí mật bị che).
6. Nhấp **Install** để đăng ký máy chủ. Khi thành công, wizard hiển thị xác nhận kèm số lượng khả năng đã khám phá.
7. Để xem các connector đã cài đặt, chuyển sang tab **Installed**. Mỗi hàng hiển thị tên máy chủ, ID connector, phiên bản template và ngày cài đặt.
8. Để gỡ cài đặt, nhấp **Uninstall** trên hàng connector tương ứng và xác nhận thao tác.

### Tùy chọn của Install Wizard

| Tùy chọn | Mặc định | Tác dụng |
|---|---|---|
| **Auto-discover tools after install** | Bật | Kích hoạt đồng bộ ngay sau khi đăng ký để cập nhật danh sách công cụ. |
| **Enable circuit breaker** | Bật | Kích hoạt circuit breaker với ngưỡng mặc định cho máy chủ mới. |
| **Apply redaction rules** | Bật | Áp dụng quy tắc che dữ liệu cấp tenant cho lưu lượng qua máy chủ này. |

### Trường dữ liệu của connector template

| Trường | Mô tả |
|---|---|
| `id` | Định danh duy nhất của connector (ví dụ: `github`, `postgres`). |
| `displayName` | Tên hiển thị cho người dùng trên thẻ catalog. |
| `category` | Một trong các giá trị: `developer-tools`, `databases`, `productivity`, `cloud`, `ai-ml`, `communications`, `local`. |
| `transport` | Loại transport: `stdio` (lệnh + đối số) hoặc `streamable-http` (URL template). |
| `requiredEnv` | Các biến môi trường bắt buộc phải cung cấp trước khi cài đặt. Biến bí mật được lưu ở dạng che. |
| `supports` | Các cờ cho biết connector hỗ trợ những khả năng MCP nào: `tools`, `resources`, `prompts`, `sampling`, `roots`. |

---

## Servers

![Màn hình Servers](../images/servers.png)

Màn hình Servers liệt kê tất cả máy chủ MCP upstream đã đăng ký với gateway. Tại đây bạn có thể đăng ký máy chủ mới thủ công, kiểm tra trạng thái session, bật/tắt định tuyến, kích hoạt đồng bộ lại công cụ và hủy đăng ký máy chủ.

### Cách sử dụng

**Duyệt danh sách**

Bảng hiển thị tên mỗi máy chủ, trạng thái kết nối (chấm xanh nghĩa là session đang hoạt động), số công cụ đã khám phá và trạng thái bật/tắt. Nhấp vào bất kỳ hàng nào để mở detail sheet.

**Đăng ký máy chủ**

1. Nhấp **New Server** ở góc trên bên phải.
2. Nhập **Name** duy nhất cho máy chủ.
3. Chọn **Transport** từ bộ chọn:
   - `Streamable HTTP` — nhập **URL** upstream và tùy chọn **Bearer token**.
   - `SSE` — cùng các trường như Streamable HTTP.
   - `STDIO` — nhập **Command** (ví dụ: `node`) và **Arguments** (ví dụ: `./server.js --port 8001`). Bật **Stateful** để giữ tiến trình con tồn tại giữa các lần gọi.
   - `OpenAPI` — nhập **Spec URL** hoặc **Spec path**, tùy chọn **Base URL**, **Token**, và lọc theo **Tags**, **Operation IDs** hoặc **Exclude operations**.
4. Nhấp **Register** để gửi. Gateway sẽ lập tức thử kết nối.

**Detail sheet của máy chủ**

Nhấp vào một hàng để mở detail sheet, hiển thị:

- **Trạng thái session** — `Connected` hoặc `Offline`.
- **Tools** — số lượng công cụ đã khám phá.
- Toggle **Enabled** — máy chủ bị tắt sẽ bị bỏ qua trong định tuyến MCP; bật/tắt mà không cần hủy đăng ký.
- Nút **Sync tools from upstream** — kích hoạt `POST /api/servers/:name/sync` để khám phá lại tools, resources và prompts từ máy chủ upstream.
- **Deregister server** — xóa vĩnh viễn máy chủ khỏi gateway và vô hiệu hóa tất cả công cụ của nó. Tiến trình upstream không bị ảnh hưởng.

### Tham chiếu trường transport

| Transport | Trường bắt buộc | Trường tùy chọn |
|---|---|---|
| `streamable-http` / `sse` | URL | Bearer token |
| `stdio` | Command | Arguments, Stateful |
| `openapi` | Spec URL hoặc Spec path | Base URL, Token, Tags, Operation IDs, Exclude operations |

---

## Tools

![Màn hình Tools](../images/tools.png)

Màn hình Tools hiển thị tất cả các công cụ đã khám phá từ các máy chủ upstream đã đăng ký. Bạn có thể bật/tắt từng công cụ và cấu hình hành vi bộ nhớ đệm cũng như các cờ nhạy cảm cho mỗi công cụ.

### Cách sử dụng

**Duyệt và lọc**

1. Dùng **ô tìm kiếm** để lọc công cụ theo tên hoặc máy chủ.
2. Bật **Show disabled** để hiển thị cả các công cụ đang tắt trong danh sách.
3. Số lượng hiển thị bên dưới tiêu đề phản ánh số công cụ đang hiển thị so với tổng số đã đăng ký (ví dụ: "12 of 20 tools from 3 servers").

**Bật và tắt công cụ**

Bật/tắt switch **Enabled** trực tiếp trên hàng trong bảng. Công cụ bị tắt sẽ không hiển thị với MCP client. Thay đổi có hiệu lực ngay lập tức qua `PUT /api/tools/:name/enable` hoặc `PUT /api/tools/:name/disable`.

**Chỉnh sửa cài đặt công cụ**

Nhấp vào một hàng để mở detail sheet của công cụ:

1. Bật/tắt **Enabled** để bật hoặc tắt công cụ.
2. Trong phần **Cache**:
   - Bật **Cacheable** để cho phép lưu đệm phản hồi của công cụ này.
   - Đặt **TTL (seconds)** — để trống để dùng mặc định toàn gateway.
   - Bật **Cache per principal** để phân chia bộ nhớ đệm theo danh tính người gọi (yêu cầu bật `Cacheable`).
3. Bật **Sensitive** để bỏ qua bộ nhớ đệm và kiểm tra các đối số công cụ nhạy cảm.
4. Nhấp **Save changes** để lưu qua `PATCH /api/tools/:name`.

### Tham chiếu trường công cụ

| Trường | Mô tả |
|---|---|
| **Tool** | Hiển thị dạng `server__originalName`. Tên canonical là `server__tool`. |
| **Description** | Mô tả công cụ do máy chủ upstream cung cấp. |
| **Enabled** | Có hiển thị công cụ với MCP client hay không. |
| **Cacheable** | Bật lưu đệm phản hồi cho công cụ này. |
| **TTL (seconds)** | Thời gian sống của cache; `null` nghĩa là dùng mặc định của gateway. |
| **Cache per principal** | Khi bật, mỗi danh tính người gọi có vùng cache riêng. |
| **Sensitive** | Bỏ qua bộ nhớ đệm và kiểm tra đối số. |

---

## Tool Groups

![Màn hình Tool Groups](../images/groups.png)

Tool Groups cho phép bạn định nghĩa các tập hợp công cụ được chọn lọc, được công khai tại một endpoint MCP riêng (`/mcp/groups/<name>`). Một nhóm có thể được giới hạn theo công cụ cụ thể, lọc theo máy chủ và hạn chế theo role.

### Cách sử dụng

**Tạo nhóm**

1. Nhấp **New Group** ở góc trên bên phải.
2. Điền:
   - **Name** — định danh nhóm, được dùng trong URL endpoint.
   - **Description** (tùy chọn) — mô tả ngắn gọn.
   - **Tools (canonical names)** — thêm công cụ theo tên canonical `server__tool` bằng chip input.
   - **Allowed roles** — để trống để cho phép tất cả role, hoặc nhập tên role cụ thể (ví dụ: `analyst`, `admin`).
3. Nhấp **Create**.

**Chỉnh sửa nhóm**

Nhấp vào một hàng nhóm để mở detail sheet. Sheet có ba tab:

- **Tab Tools** — quản lý danh sách công cụ tường minh bằng chip input.
- **Tab Filters** — đặt `Included servers` (gộp tất cả công cụ từ các máy chủ được liệt kê) và `Excluded tools` (tên công cụ bị loại khỏi nhóm, kể cả khi máy chủ của chúng được gộp vào).
- **Tab Roles** — đặt `Allowed roles`; để trống nghĩa là tất cả role được phép.

Nhấp **Save changes** để lưu. Nhấp **Delete group** (thao tác phá hủy, có xác nhận) để xóa vĩnh viễn nhóm và endpoint của nó.

### Tham chiếu trường nhóm

| Trường | Mô tả |
|---|---|
| **Name** | Định danh an toàn cho URL. Truy cập tại `/mcp/groups/<name>`. |
| **Description** | Mô tả tự do, tùy chọn. |
| **Tools** | Danh sách tường minh các tên canonical (`server__tool`). |
| **Included servers** | Tất cả công cụ từ các máy chủ này được gộp vào nhóm. |
| **Excluded tools** | Công cụ bị loại khỏi nhóm dù máy chủ của chúng được gộp. |
| **Allowed roles** | Tên role được phép truy cập endpoint của nhóm; để trống = không giới hạn. |

---

## Resources

![Màn hình Resources](../images/resources.png)

Màn hình Resources hiển thị tất cả tài nguyên MCP đã khám phá từ các máy chủ upstream qua phương thức giao thức `resources/list`. Tài nguyên được nhóm theo máy chủ ở panel bên trái; chọn một tài nguyên để hiển thị nội dung ở panel bên phải.

### Cách sử dụng

1. Dùng ô **Search by URI** ở trên cùng để lọc tài nguyên trên tất cả máy chủ.
2. Ở panel trái, mở rộng nhóm máy chủ và nhấp vào một tài nguyên để chọn.
3. Panel phải hiển thị tên, URI, loại MIME của tài nguyên và switch để **bật hoặc tắt** tài nguyên. Tài nguyên bị tắt trả về `403` khi MCP client cố đọc.
4. Nội dung tài nguyên được tải tự động khi bạn chọn. Nếu loại MIME là text hoặc JSON, nội dung được hiển thị trực tiếp; payload nhị phân hiển thị nút **Download**.
5. Bật/tắt switch **Enabled** ở panel phải để bật hoặc tắt ngay lập tức qua `PUT /api/resources/:canonical/enable` hoặc `PUT /api/resources/:canonical/disable`.

> **Lưu ý:** Tài nguyên được tự động khám phá khi đăng ký máy chủ hoặc khi bạn nhấn **Sync tools from upstream** trên màn hình Servers. Chúng không thể được tạo thủ công.

### Tham chiếu trường tài nguyên

| Trường | Mô tả |
|---|---|
| **URI** | URI tài nguyên MCP (ví dụ: `file:///data/report.csv`). |
| **Name** | Tên thân thiện do máy chủ upstream cung cấp. |
| **MIME type** | Loại nội dung (ví dụ: `text/plain`, `application/json`). Hiển thị `binary` khi không xác định. |
| **Enabled** | Có cho phép MCP client đọc tài nguyên này hay không. |
| **Sensitive** | Khi được thiết lập bởi máy chủ upstream, nội dung không được lưu đệm hay kiểm tra. |

---

## Virtual Tools

![Màn hình Virtual Tools](../images/virtual-tools.png)

Virtual Tools là các meta-tool được điều phối theo DAG một cách khai báo, kết hợp nhiều lời gọi công cụ upstream thành một công cụ có tên duy nhất. Mỗi virtual tool được định nghĩa bằng một **plan** JSON mô tả các bước, ánh xạ đối số dùng biểu thức template `{{input.*}}` / `{{steps.*}}`, và định dạng đầu ra.

### Cách sử dụng

**Xem danh sách**

Bảng hiển thị tên canonical, số bước, error policy và thời gian cập nhật cuối của mỗi virtual tool. Nhấp vào một hàng để mở editor của công cụ đó.

**Tạo virtual tool mới**

1. Nhấp **New virtual tool**.
2. Editor tải với plan mẫu. Chỉnh sửa JSON trong vùng văn bản **Plan (JSON)**:
   - Đặt `name` thành tên canonical (ví dụ: `myserver__analyze`).
   - Đặt `description` là mô tả thân thiện.
   - Định nghĩa `inputSchema` là đối tượng JSON Schema mô tả các đối số của công cụ.
   - Thêm một hoặc nhiều `steps`, mỗi bước có: `id`, `tool` (tên canonical của công cụ upstream), `args` (có biểu thức template), và tùy chọn `parallel`, `when`, `timeoutMs`.
   - Đặt `output` với `format` (`merged` hoặc `select`) và `shape`.
   - Đặt `errorPolicy` là `fail_fast` hoặc `best_effort`.
3. Nhấp **Validate** để kiểm tra plan. Lỗi validation được liệt kê bên dưới vùng văn bản.
4. Nhấp **Save** để tạo virtual tool qua `POST /api/virtual-tools`.

**Chỉnh sửa virtual tool hiện có**

1. Nhấp vào hàng của công cụ trong danh sách để mở editor.
2. Sửa JSON plan và nhấp **Validate**, sau đó **Save** để lưu qua `PUT /api/virtual-tools/:name`.

**Kiểm thử virtual tool**

Trên trang editor của một công cụ hiện có, nhập đối số JSON vào ô **Test args** và nhấp **Run test**. Panel bên dưới hiển thị kết quả từng bước (đối số, kết quả hoặc lỗi, độ trễ) và đầu ra cuối cùng.

**Xóa virtual tool**

Nhấp biểu tượng thùng rác trên hàng trong danh sách và xác nhận thao tác xóa.

### Tham chiếu trường plan

| Trường | Kiểu | Mô tả |
|---|---|---|
| `name` | string | Tên canonical của virtual tool. |
| `description` | string | Mô tả thân thiện hiển thị với MCP client. |
| `inputSchema` | JSON Schema | Mô tả các đối số mà virtual tool nhận. |
| `steps` | array | Danh sách lời gọi công cụ theo thứ tự. Mỗi bước có `id`, `tool`, `args` và tùy chọn `parallel`, `when`, `timeoutMs`. |
| `output.format` | `merged` \| `select` | Cách kết hợp kết quả các bước thành đầu ra cuối cùng. |
| `output.shape` | object hoặc string | Biểu thức template chọn hoặc hợp nhất kết quả các bước. |
| `errorPolicy` | `fail_fast` \| `best_effort` | `fail_fast` dừng khi bước đầu tiên lỗi; `best_effort` tiếp tục và báo cáo tất cả lỗi. |

---

## Prompts

![Màn hình Prompts](../images/prompts.png)

Màn hình Prompts liệt kê tất cả prompt do máy chủ định nghĩa, được khám phá từ các máy chủ upstream qua phương thức giao thức MCP `prompts/list`. Prompt được hiển thị theo nhóm máy chủ. Bạn có thể bật hoặc tắt từng prompt.

### Cách sử dụng

1. Mở **Prompts** trên thanh sidebar.
2. Các prompt được tổ chức trong các thẻ, mỗi thẻ là một máy chủ. Mỗi prompt hiển thị tên và mô tả của nó.
3. Bật/tắt **switch** bên cạnh một prompt để bật hoặc tắt ngay lập tức qua `PUT /api/prompts/:name/enable` hoặc `PUT /api/prompts/:name/disable`.
4. Prompt bị tắt sẽ không hiển thị với MCP client khi gọi `prompts/list`.

> **Lưu ý:** Prompt được tự động khám phá khi đăng ký máy chủ và máy chủ đó phản hồi yêu cầu MCP `prompts/list`. Chúng không thể được tạo thủ công trong dashboard.

### Tham chiếu trường prompt

| Trường | Mô tả |
|---|---|
| **Name** | Tên gốc của prompt do máy chủ upstream định nghĩa. |
| **Description** | Mô tả tùy chọn do máy chủ upstream cung cấp. |
| **Enabled** | Có cho phép MCP client xem và gọi prompt này hay không. |
| **Server** | Máy chủ upstream định nghĩa prompt này. |

---

## Proxies

![Màn hình Proxies](../images/proxies.png)

Màn hình Proxies quản lý cấu hình proxy HTTP/SOCKS5 outbound dùng để định tuyến lưu lượng egress đến các máy chủ MCP upstream thông qua một trung gian. Proxy được tham chiếu theo tên từ cấu hình máy chủ và nhóm.

### Cách sử dụng

**Tạo proxy**

1. Nhấp **New Proxy** ở góc trên bên phải.
2. Điền:
   - **Name** — chỉ dùng chữ thường, số và dấu gạch ngang (ví dụ: `corp-proxy`). Được tham chiếu từ máy chủ và nhóm.
   - **URL** — địa chỉ proxy. Hỗ trợ scheme `http://`, `https://`, `socks5://` và `socks5h://` (ví dụ: `http://user:pass@proxy.example.com:3128`).
   - **Description** (tùy chọn) — nhãn mô tả.
3. Nhấp **Create**.

**Xem và chỉnh sửa proxy**

Nhấp vào một hàng trong bảng để mở detail sheet:

- **URL** — cập nhật URL proxy trực tiếp. Mật khẩu bị che trong danh sách nhưng có thể cập nhật đầy đủ tại đây.
- **Description** — cập nhật mô tả.
- Toggle **Enabled** — proxy bị tắt sẽ không định tuyến các yêu cầu mới; máy chủ tham chiếu chúng sẽ chuyển sang định tuyến trực tiếp.
- Nhấp **Save URL + description** để lưu thay đổi URL và mô tả.

**Tham chiếu**

Detail sheet hiển thị những máy chủ và nhóm nào đang tham chiếu proxy này (hiển thị dạng badge `server:<name>` hoặc `group:<name>`).

**Xóa proxy**

Trong detail sheet, nhấp **Delete proxy** trong vùng nguy hiểm:

- Nếu proxy không có tham chiếu nào, hộp thoại xác nhận tiêu chuẩn sẽ xuất hiện.
- Nếu proxy đang được tham chiếu bởi một hoặc nhiều máy chủ/nhóm, bạn phải nhấp **Force delete (cascade)**. Gateway sẽ ngắt proxy khỏi tất cả tham chiếu và các máy chủ/nhóm đó sẽ chuyển sang định tuyến trực tiếp.

### Tham chiếu trường proxy

| Trường | Mô tả |
|---|---|
| **Name** | Định danh duy nhất; dùng khi gắn proxy vào máy chủ hoặc nhóm. |
| **URL** | URL proxy đầy đủ bao gồm scheme, thông tin xác thực (tùy chọn), host và port. |
| **Description** | Mô tả tự do, tùy chọn. |
| **Enabled** | Khi tắt, proxy bị bỏ qua và các tham chiếu chuyển sang định tuyến trực tiếp. |
| **References** | Danh sách máy chủ và nhóm đang dùng proxy này. |

---

## Xem thêm

- [Getting Started](./getting-started.md)
- [Architecture](./architecture.md)
- [Identity](./identity.md)
- [Reliability](./reliability.md)
