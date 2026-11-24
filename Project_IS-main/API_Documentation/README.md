# Tài liệu API — Phần Bảo Mật (AttendSecure)

Thư mục này chứa tài liệu đặc tả các REST API thực tế đã được triển khai trong module **Bảo mật, Xác thực & Chấm công Webcam** của hệ thống AttendSecure.

## Danh sách tài liệu

- [API.md](./API.md): Đặc tả chi tiết toàn bộ endpoint (`/api/v1/health`, `/api/v1/auth/*`, `/api/v1/attendance/*`, `/api/v1/employees/me`), bao gồm HTTP Method, Request, Response, Status Code và cơ chế xác thực.

*(Lưu ý: Project gốc không sử dụng file `openapi.json` hay Postman Collection, do đó thư mục này chỉ cung cấp tài liệu `API.md` được biên soạn trực tiếp từ source code thực tế.)*

## Tóm tắt cơ chế bảo mật API

1. **Same-Origin & Session Cookie**:
   - Mọi phiên đăng nhập được quản lý qua cookie `attendsecure.sid` (`HttpOnly`, `SameSite=Lax`).
   - Khi gọi API từ client ngoài trình duyệt (như `curl` hoặc công cụ test), cần lưu giữ cookie giữa các request (ví dụ `-c cookies.txt -b cookies.txt`).
2. **Chống CSRF (Synchronizer Token Pattern)**:
   - Tất cả endpoint `POST` (`/auth/login`, `/auth/logout`, `/attendance/check-in`, `/attendance/check-out`) đều yêu cầu header `X-CSRF-Token` khớp với `req.session.csrfToken`.
   - Lấy token ban đầu qua `GET /api/v1/auth/csrf-token`. Sau khi đăng nhập thành công, server cấp lại session mới và xoay vòng `csrfToken` mới trong response body của `/auth/login`.
3. **Định dạng lỗi thống nhất**:
   ```json
   {
     "success": false,
     "error": {
       "code": "ERROR_CODE",
       "message": "Mô tả lỗi"
     }
   }
   ```
