# AttendSecure — Face Authentication Demo

Ứng dụng chấm công nội bộ chạy hoàn toàn trên máy local. Người dùng đăng ký hồ sơ cùng descriptor khuôn mặt 128 chiều, sau đó đăng nhập bằng mã nhân viên/email, mật khẩu và webcam. Giao diện hiện tại được giữ nguyên.

## Chạy local

Yêu cầu Node.js 22.5 trở lên và npm.

1. Mở PowerShell tại thư mục `Project_IS-main`.
2. Chạy `./Run-Project.ps1`.
3. Mở `http://127.0.0.1:3000/register`, tạo tài khoản bằng webcam rồi đăng nhập tại `/login`.

> Webcam cần secure context; `localhost` và `127.0.0.1` được trình duyệt cho phép trên máy local. Cho phép quyền Camera khi trình duyệt hỏi. Model nhận diện được phục vụ từ `frontend/models`, không cần tải model từ dịch vụ ngoài.

> Tài khoản mẫu do seed tạo: `EMP001` hoặc `EMP002`; mật khẩu mặc định `AttendSecure@2026`. Tài khoản mẫu không có face descriptor, nên cần đăng ký tài khoản mới để demo face login. Có thể đổi mật khẩu seed trong `backend/.env`.

## Luồng xác thực

1. Backend cấp thử thách liveness ngẫu nhiên gắn với nonce trong session, hết hạn sau 60 giây và chỉ dùng một lần.
2. Trình duyệt mở webcam, đo EAR để nhận biết chớp mắt và tỷ lệ landmark để nhận biết quay đầu. Thử thách được chọn ngẫu nhiên cho mỗi lần đăng nhập.
3. Trong suốt thử thách, descriptor được kiểm tra liên tục để ngăn đổi người giữa chừng. Descriptor cuối được gửi lên backend.
4. Backend kiểm tra dữ liệu descriptor, so khớp Euclidean distance với descriptor đã đăng ký (ngưỡng hiện tại `0.55`), kiểm tra mật khẩu, CSRF, session và giới hạn số lần đăng nhập.

## Kịch bản trình bày cuối kỳ

1. Đăng ký tài khoản mới với khuôn mặt trước webcam.
2. Đăng nhập bằng đúng thông tin và thực hiện động tác được yêu cầu.
3. Đăng xuất, nhập sai mật khẩu để trình bày phản hồi từ chối.
4. Thử đưa ảnh tĩnh trên điện thoại trước camera: ảnh không thể tự chớp mắt hoặc quay đầu theo thử thách nên luồng liveness phải hết thời gian và từ chối.
5. Thử gửi lại nonce cũ để trình bày kiểm soát single-use/expiry phía server.

## Các kiểm soát bảo mật

- Mật khẩu được băm bằng bcrypt; đăng ký yêu cầu tối thiểu 8 ký tự gồm chữ hoa, chữ thường, số và ký tự đặc biệt.
- CSRF token, cookie session `HttpOnly`/`SameSite`, đổi session ID sau đăng nhập, giới hạn request đăng nhập.
- Thử thách có nonce ngẫu nhiên mật mã, ràng buộc với session và hết hạn; nonce đã dùng không thể dùng lại.
- Chấm công yêu cầu nonce liveness riêng, dùng một lần, do backend cấp cho nhân viên đã đăng ký khuôn mặt; request cũ thiếu challenge bị từ chối.
- Descriptor phải có đúng 128 giá trị hữu hạn trong miền hợp lệ trước khi tính khoảng cách.
- CSP, Helmet, giới hạn kích thước upload và kiểm tra chữ ký file ảnh được bật cho backend.

## Giới hạn demo

Liveness hiện được suy luận ở phía trình duyệt từ luồng webcam; server xác thực nonce và kết quả challenge được gửi lên nhưng không tự chạy mô hình PAD trên video thô. Vì vậy demo phù hợp để minh họa chặn ảnh tĩnh trong luồng sử dụng bình thường, chưa chống được người có khả năng sửa JavaScript hoặc tự tạo request. Hệ thống không nên dùng để quyết định danh tính trong môi trường rủi ro cao nếu chưa bổ sung PAD chạy phía server và đánh giá trên bộ dữ liệu presentation-attack.

## Cấu trúc

- `frontend/`: trang HTML/CSS/JS và model face-api.js chạy cục bộ.
- `backend/`: Express API, SQLite, session, xác thực và nghiệp vụ chấm công.
- `API_Documentation/`: mô tả API.
