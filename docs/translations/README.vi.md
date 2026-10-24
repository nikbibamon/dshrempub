# Tvijo DSHREM — từ một nhiệm vụ đến một kết quả đã được kiểm tra

[English](README.en.md) · [Русский](README.ru.md) · [All languages / Все языки](../../README.md#read-the-introductory-guide-in-your-language)

Tvijo mang đến một không gian làm việc trên trình duyệt, một tiện ích mở rộng VS Code và các công cụ dòng lệnh xoay quanh một quy trình phát triển chung. Hãy mô tả nhiệm vụ, chọn máy chủ thực thi và quyền hạn cho nó, xem xét các thay đổi, và lưu lại bằng chứng đã dùng để chấp nhận kết quả. Hướng dẫn này giới thiệu sản phẩm; README kỹ thuật của kho mã và tài liệu tham khảo lệnh vẫn là nguồn có thẩm quyền đối với CLI.

## Bắt đầu với không gian làm việc bạn thích

Mở [DSHREM](https://dsh.tvijo.com/), tải [tiện ích mở rộng VS Code và hướng dẫn dùng terminal](https://dsh.tvijo.com/download), hoặc đọc [giải thích về các cài đặt](https://dsh.tvijo.com/knowledge/settings-explained). Đăng nhập qua quy trình tài khoản mà dịch vụ hỗ trợ. Không bao giờ dán khóa API của nhà cung cấp vào một prompt được chia sẻ, một issue công khai hay một kho mã.

CLI của Node.js yêu cầu Node 22 hoặc mới hơn. Từ một bản sao cục bộ của kho mã:

```sh
npm install -g .
dsh login
dsh doctor
dsh chat
```

Lệnh này cũng có thể dùng với tên `dshrem`. CLI chat từ xa này hiển thị các công cụ được gợi ý mà không thực thi chúng. Việc chỉnh sửa cục bộ và thực thi lệnh thuộc về VS Code Agent hoặc một host runtime được cấu hình rõ ràng; chúng có quyền hạn riêng. Xem [trợ giúp CLI](https://github.com/nikbibamon/dshrempub/blob/main/docs/HELP.md).

## Hiểu rõ các lựa chọn

**Bằng chứng trước tiên** tách biệt các dữ kiện được chứng minh khỏi các giả định. **Lập kế hoạch và kiểm tra** yêu cầu một kế hoạch ngắn và đối chiếu kết quả với yêu cầu. **Xem xét lại câu trả lời** phản biện một bản nháp; đó là tự đánh giá trừ khi một người đánh giá riêng được chỉ định rõ ràng. Không phương pháp nào trong số này bảo đảm tính đúng đắn hay việc dùng ít token hơn.

Các preset nhiệm vụ bổ sung hướng dẫn và danh sách kiểm tra có thể tái sử dụng. Chúng không tạo thêm bộ nhớ cho mô hình. Một bộ sưu tập ngữ cảnh lớn hơn vẫn phải nằm trong giới hạn yêu cầu của dịch vụ và mô hình. Các đường dẫn nâng cao của controller, Python và trạng thái đề cập đến host của tiện ích mở rộng đã chọn; trong Remote SSH, đó là máy chủ từ xa.

## Làm việc theo nhóm khi điều đó hữu ích

Một nhóm AGENTROY giao cho một điều phối viên, những người triển khai và những người đánh giá các trách nhiệm khác nhau. Các chính sách của host có thể yêu cầu DSHREM ds41f và các công cụ Codex hoặc Claude dựa trên tài khoản, cùng với việc đánh giá kiến trúc tùy chọn. Tính khả dụng phụ thuộc vào runtime đã cài đặt, quyền truy cập tài khoản và chính sách đã chọn. Một gói đăng ký bị thiếu không được âm thầm biến thành một lệnh gọi API trả phí.

Ba đến sáu vai trò là lựa chọn tổ chức, không phải một công thức cho chất lượng. Những người đánh giá cần đúng phiên bản artifact và bằng chứng kiểm thử. Một kiểm tra thất bại nghiêm trọng sẽ chặn việc chấp nhận ngay cả khi các mô hình đồng ý với nhau. Đọc [nhóm agent và chi phí hiển thị](https://dsh.tvijo.com/knowledge/agentroy-teams-and-costs).

## Tiếp tục mà không che giấu sự chưa chắc chắn

Một phiên tmux tách rời trên máy chủ có thể tiếp tục sau khi máy tính xách tay hoặc điện thoại ngắt kết nối. Công việc trên một máy tính cục bộ đã tắt nguồn thì không thể. Máy chủ hỏng, áp lực bộ nhớ và mất lưu trữ vẫn cần được khắc phục. Hãy kết nối lại với ID nhiệm vụ đã lưu và xem xét sự kiện được xác nhận gần nhất của nó trước khi bắt đầu thêm công việc. Đừng lặp lại một cách mù quáng một yêu cầu tính phí mà kết quả chưa rõ. Xem [ngắt kết nối và khôi phục](https://dsh.tvijo.com/knowledge/durable-work-and-recovery).

## Giữ chi phí và dữ liệu luôn hiển thị

Hãy xem xét báo giá đã được chấp nhận, giới hạn nhiệm vụ, số tiền đã đặt trước và biên lai sử dụng. Mức phí dịch vụ 8% sẽ biến USD1.00 chi phí của nhà cung cấp thành USD1.08 trước các khoản phí được công bố riêng; đây là một ví dụ, không phải một báo giá. Hạn mức đăng ký, phí nhà cung cấp và tài nguyên máy chủ là những giới hạn khác nhau. Ngân sách bổ sung cần một lựa chọn rõ ràng.

Các tệp thông tin đăng nhập của CLI cục bộ dùng quyền chỉ dành cho chủ sở hữu. Các quyền này không phải là mã hóa hay một bản sao lưu. Việc tải lên kiến thức là rõ ràng; các tệp riêng tư không bao giờ nên nằm trong một liên kết bàn giao công khai. [Bàn giao prompt](https://dsh.tvijo.com/knowledge/prompt-handoffs) giải thích cách sao chép một nhiệm vụ đã được xem xét sang một công cụ khác.

Gói của kho mã này hiện được đánh dấu `UNLICENSED`; việc công bố không cấp quyền tái sử dụng. Hãy tham khảo siêu dữ liệu hiện tại của gói và thông báo giấy phép trước khi phân phối lại. Các bản dịch là những hướng dẫn giới thiệu, được tạo bằng DSHREM và được kiểm tra tính nhất quán về cấu trúc; tiếng Anh là bản tham chiếu cho các khác biệt kỹ thuật.
