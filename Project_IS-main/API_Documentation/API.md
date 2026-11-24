# Đặc tả REST API — AttendSecure

**Base URL:** `/api/v1`

Tất cả các API được triển khai trong `backend/src/routes/` và `backend/src/controllers/`. Các endpoint không khớp dưới `/api/*` sẽ trả về `404 Not Found` dạng JSON.

---

## Quy ước Xác thực & CSRF

- **Session Cookie (`attendsecure.sid`)**: Được cấp bởi `express-session` và lưu trong bảng `sessions` (SQLite). Các endpoint yêu cầu đăng nhập sẽ trả về `401 Unauthorized` (`UNAUTHORIZED`) nếu không có session hợp lệ.
- **CSRF Header (`X-CSRF-Token`)**: Bắt buộc trên mọi request `POST`. Server kiểm tra bằng `crypto.timingSafeEqual`; nếu thiếu hoặc sai sẽ trả về `403 Forbidden` (`CSRF_INVALID`).

---

## 1. System Health

### `GET /api/v1/health`
Kiểm tra trạng thái hoạt động của API và ngày chấm công hiện tại theo múi giờ `Asia/Ho_Chi_Minh`.

- **Xác thực:** Không yêu cầu.
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "status": "ok",
      "service": "AttendSecure API",
      "timestamp": "2026-11-21T07:40:00.000Z",
      "attendanceDate": "2026-11-21",
      "timezone": "Asia/Ho_Chi_Minh"
    }
  }
  ```

---

## 2. Authentication (`/api/v1/auth`)

### `GET /api/v1/auth/csrf-token`
Khởi tạo (nếu chưa có) và trả về Synchronizer CSRF Token gắn với session hiện tại.

- **Xác thực:** Không yêu cầu đăng nhập (tạo/duy trì session cookie).
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "csrfToken": "<64-char-hex-token>"
    }
  }
  ```

### `POST /api/v1/auth/login`
Xác thực nhân viên bằng `employee_code` hoặc `email` và mật khẩu. Khi thành công, server gọi `req.session.regenerate()` để chống Session Fixation và xoay vòng `csrfToken` mới. Có áp dụng rate limiter.

- **Xác thực:** Không yêu cầu đăng nhập trước.
- **CSRF:** Bắt buộc header `X-CSRF-Token`.
- **Content-Type:** `application/json`
- **Request Body:**
  ```json
  {
    "identifier": "EMP001",
    "password": "<employee-password>",
    "rememberMe": false
  }
  ```
  *(Trong đó `identifier` tối đa 120 ký tự, `password` tối đa 128 ký tự, `rememberMe` tùy chọn — nếu `true`, thời hạn cookie là 7 ngày thay vì `SESSION_MAX_AGE_MS`.)*
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Login successful",
    "data": {
      "employee": {
        "id": 1,
        "employeeCode": "EMP001",
        "name": "Nguyen Minh Anh",
        "role": "EMPLOYEE"
      },
      "csrfToken": "<new-64-char-hex-token>"
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request` (`INVALID_REQUEST` / `VALIDATION_ERROR` / `INVALID_JSON`): Payload không hợp lệ hoặc thiếu trường.
  - `401 Unauthorized` (`INVALID_CREDENTIALS`): Sai `identifier` hoặc `password`.
  - `403 Forbidden` (`CSRF_INVALID` hoặc `ACCOUNT_INACTIVE`): Sai CSRF token hoặc tài khoản không ở trạng thái `ACTIVE`.
  - `429 Too Many Requests` (`TOO_MANY_REQUESTS`): Vượt quá số lần đăng nhập cho phép trong cửa sổ thời gian.

### `GET /api/v1/auth/me`
Trả về thông tin hồ sơ công khai của nhân viên đang đăng nhập.

- **Xác thực:** Bắt buộc (`requireAuth`).
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "employee": {
        "id": 1,
        "employeeCode": "EMP001",
        "name": "Nguyen Minh Anh",
        "email": "minhanh.nguyen@attendsecure.local",
        "department": "Information Security",
        "role": "EMPLOYEE",
        "status": "ACTIVE",
        "createdAt": "2026-11-21T03:00:00.000Z"
      }
    }
  }
  ```
- **Error Responses:** `401 Unauthorized` (`UNAUTHORIZED`).

### `POST /api/v1/auth/logout`
Hủy session trên server (xóa khỏi bảng `sessions`) và xóa cookie `attendsecure.sid` phía trình duyệt.

- **Xác thực:** Theo session hiện tại.
- **CSRF:** Bắt buộc header `X-CSRF-Token`.
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Logged out successfully"
  }
  ```
- **Error Responses:** `403 Forbidden` (`CSRF_INVALID`).

---

## 3. Attendance & Webcam Evidence (`/api/v1/attendance`)

Tất cả các endpoint dưới `/api/v1/attendance/*` đều bắt buộc `requireAuth` (`401 Unauthorized` nếu chưa đăng nhập).

### `POST /api/v1/attendance/check-in`
Ghi nhận Check-in trong ngày (`Asia/Ho_Chi_Minh`) kèm ảnh chụp từ webcam.

- **Xác thực:** Bắt buộc (`requireAuth`).
- **CSRF:** Bắt buộc header `X-CSRF-Token`.
- **Content-Type:** `multipart/form-data`
- **Form Field:** `photo` (bắt buộc 1 file ảnh định dạng JPEG hoặc WebP, dung lượng tối đa 2 MB; server kiểm tra cả MIME type và **magic bytes** thực tế của buffer).
- **Response `201 Created`:**
  ```json
  {
    "success": true,
    "message": "Check-in recorded successfully",
    "data": {
      "record": {
        "id": 1,
        "attendanceDate": "2026-11-21",
        "checkInAt": "2026-11-21T04:05:00.000Z",
        "checkOutAt": null,
        "hasCheckInPhoto": true,
        "hasCheckOutPhoto": false,
        "status": "CHECKED_IN",
        "createdAt": "2026-11-21T04:05:00.000Z",
        "updatedAt": "2026-11-21T04:05:00.000Z"
      }
    }
  }
  ```
- **Error Responses:**
  - `400 Bad Request` (`PHOTO_REQUIRED` / `UPLOAD_ERROR` / `INVALID_PATH`): Thiếu file ảnh hoặc multipart lỗi.
  - `401 Unauthorized` (`UNAUTHORIZED`): Chưa đăng nhập.
  - `403 Forbidden` (`CSRF_INVALID`): Thiếu hoặc sai `X-CSRF-Token`.
  - `409 Conflict` (`DUPLICATE_CHECK_IN`): Nhân viên đã Check-in trong ngày hôm nay.
  - `413 Payload Too Large` (`PAYLOAD_TOO_LARGE`): Ảnh vượt quá `MAX_UPLOAD_BYTES` (mặc định 2 MB).
  - `415 Unsupported Media Type` (`UNSUPPORTED_MEDIA_TYPE`): File không phải JPEG hoặc WebP hợp lệ (sai MIME hoặc sai magic bytes).

### `POST /api/v1/attendance/check-out`
Ghi nhận Check-out trong ngày kèm ảnh chụp webcam mới.

- **Xác thực:** Bắt buộc (`requireAuth`).
- **CSRF:** Bắt buộc header `X-CSRF-Token`.
- **Content-Type:** `multipart/form-data`
- **Form Field:** `photo` (ảnh JPEG hoặc WebP mới chụp, tối đa 2 MB).
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Check-out recorded successfully",
    "data": {
      "record": {
        "id": 1,
        "attendanceDate": "2026-11-21",
        "checkInAt": "2026-11-21T04:05:00.000Z",
        "checkOutAt": "2026-11-21T10:30:00.000Z",
        "hasCheckInPhoto": true,
        "hasCheckOutPhoto": true,
        "status": "CHECKED_OUT",
        "createdAt": "2026-11-21T04:05:00.000Z",
        "updatedAt": "2026-11-21T10:30:00.000Z"
      }
    }
  }
  ```
- **Error Responses:**
  - `400`, `401`, `403`, `413`, `415` tương tự `check-in`.
  - `409 Conflict` (`CHECK_IN_REQUIRED` hoặc `DUPLICATE_CHECK_OUT`): Chưa Check-in trong ngày hoặc đã Check-out rồi.

### `GET /api/v1/attendance/today`
Lấy trạng thái và bản ghi chấm công hôm nay của nhân viên đang đăng nhập.

- **Xác thực:** Bắt buộc (`requireAuth`).
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "attendanceDate": "2026-11-21",
      "status": "NOT_CHECKED_IN",
      "record": null
    }
  }
  ```
  *(Giá trị `status` có thể là `NOT_CHECKED_IN`, `CHECKED_IN`, hoặc `CHECKED_OUT`.)*

### `GET /api/v1/attendance/history`
Lấy danh sách lịch sử chấm công phân trang, chỉ thuộc về nhân viên đang đăng nhập.

- **Xác thực:** Bắt buộc (`requireAuth`).
- **Query Parameters:**
  - `page` (số nguyên `1..1000`, mặc định `1`)
  - `limit` (số nguyên `1..50`, mặc định `10`)
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "data": {
      "records": [],
      "pagination": {
        "page": 1,
        "limit": 10,
        "total": 0,
        "totalPages": 1
      }
    }
  }
  ```
- **Error Responses:** `400 Bad Request` (`VALIDATION_ERROR`), `401 Unauthorized` (`UNAUTHORIZED`).

### `GET /api/v1/attendance/:id/evidence/:type`
Truy xuất (stream) file ảnh bằng chứng chấm công từ thư mục lưu trữ riêng tư. Server kiểm tra quyền sở hữu bản ghi theo `req.session.employeeId`.

- **Xác thực:** Bắt buộc (`requireAuth`).
- **Path Parameters:**
  - `id`: ID bản ghi chấm công (số nguyên dương `>= 1`).
  - `type`: `check-in` hoặc `check-out`.
- **Response `200 OK`:** Trả về binary image (`image/jpeg` hoặc `image/webp`) kèm header `Cache-Control: no-store` và `X-Content-Type-Options: nosniff`.
- **Error Responses:**
  - `400 Bad Request` (`INVALID_ID` / `INVALID_EVIDENCE_TYPE`)
  - `401 Unauthorized` (`UNAUTHORIZED`)
  - `403 Forbidden` (`FORBIDDEN`): Đường dẫn file không hợp lệ (chống path traversal).
  - `404 Not Found` (`RECORD_NOT_FOUND` / `EVIDENCE_NOT_FOUND`): Bản ghi không tồn tại, không thuộc về nhân viên hiện tại, hoặc file ảnh không tồn tại.

---

## 4. Employees (`/api/v1/employees`)

### `GET /api/v1/employees/me`
Trả về thông tin hồ sơ không nhạy cảm của nhân viên đang đăng nhập (không bao gồm `password_hash`).

- **Xác thực:** Bắt buộc (`requireAuth`).
- **Response `200 OK`:** Cấu trúc giống `GET /api/v1/auth/me`.
- **Error Responses:** `401 Unauthorized` (`UNAUTHORIZED`).
