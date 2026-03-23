# 🛸 Vibe Gallery DB Schema Memo

이 파일은 9번 프로젝트(Vibe Gallery)의 데이터베이스 구조와 수파베이스(Supabase) 설정 내역을 집대성한 공식 메모입니다.

---

## 1. 📊 Tables (주요 테이블)

### **`vibes` (프로젝트 전시)**
- **id**: UUID (Primary Key)
- **created_at**: Timestamptz (자동 생성)
- **title**: text (프로젝트 제목)
- **summary**: text (한 줄 요약)
- **description**: text (상세 설명)
- **image**: text (Supabase Storage 퍼블릭 URL)
- **link**: text (프로젝트 연결 링크)
- **tech**: text[] (사용 기술 스택 배열)
- **likes**: int8 (공감 수)
- **dislikes**: int8 (비공감 수)
- **user_id**: UUID (Foreign Key -> auth.users.id)
- **user_email**: text (작성자 이메일)
- **[Constraint]**: `unique_user_vibe` (관리자 제외, 계정당 1개만 업로드 가능)

### **`comments` (피드백)**
- **id**: UUID (Primary Key)
- **created_at**: Timestamptz
- **vibe_id**: UUID (Foreign Key -> vibes.id, **ON DELETE CASCADE**)
- **user_id**: UUID (작성자 ID)
- **user_email**: text (작성자 이메일)
- **content**: text (댓글 내용)

### **`vibe_votes` (투표 시스템)**
- **id**: UUID (Primary Key)
- **vibe_id**: UUID (Foreign Key -> vibes.id)
- **user_id**: UUID (투표자 ID)
- **vote_type**: text ('up' 또는 'down')
- **[Unique Index]**: (vibe_id, user_id) - 중복 투표 방지

### **`profiles` (사용자 권한 및 정보 관리)**
- **id**: UUID (Primary Key -> auth.users.id)
- **role**: text (기본값: 'user', 테스트용: 'admin')
- **email**: text (사용자 이메일 - **자동 수집 설정 필수**)

---

## 2. ⚡ Triggers & Functions (자동화)

### **인증 시 프로필 및 이메일 자동 생성 (Profiles Auto-fill)**
- **Function**: `handle_new_user()`
- **Trigger**: `on_auth_user_created` 
- **설명**: 사용자가 처음 로그인 시 `profiles` 테이블에 ID와 **이메일(new.email)**을 자동으로 저장하도록 설계됨.

### **업로드 제한 관리자 예외 (Admins Exception)**
- **Function**: `check_vibe_upload_limit()`
- **Trigger**: `tr_check_vibe_limit` (일반 유저는 1개만 업로드 가능하게 막고, 어드민은 예외 처리)

---

## 3. 📂 Storage (이미지 보관)

- **Buckets**: `vibe-images`, `vibe-images2`
- **Failover**: 첫 번째 버킷이 꽉 차면 자동으로 두 번째 버킷으로 업로드하도록 프로그램 설계됨.
- **Policies**: 
  - 조회: Public (누구나 가능)
  - 업로드: 인증된 사용자만 가능
  - 삭제: 본인의 이미지(user_id 폴더)만 삭제 가능

---

## 4. 🔒 RLS (보안 정책 핵심)
- **Vibes**: 삭제 정책 강화 (본인 또는 어드민만 삭제 가능)
- **Comments**: 수파베이스 RLS를 통해 본인 댓글만 수정/삭제 가능하도록 보호 중.
