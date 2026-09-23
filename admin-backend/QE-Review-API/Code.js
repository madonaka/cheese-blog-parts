/**
 * Cheese QE Review System - Google Apps Script (GAS) Backend
 *
 * 기능:
 * 1. 구글 드라이브(Google Drive)에 고용량 시안(이미지/PDF) 자동 업로드 및 공유 링크 생성
 *    - 휴대폰과 컴퓨터 어느 기기에서든 동일한 원본 시안을 열 수 있도록 지원
 * 2. 구글 스프레드시트(Google Sheets)에 검수 문서·폴더·지적사항 양방향 동기화
 * 3. 기기 간 CORS 이슈 없는 안전한 시안 파일 Base64 스트리밍 (doGet)
 *
 * 시트/드라이브가 원본이고 브라우저 저장소는 캐시다.
 * 브라우저에만 있는 값은 다른 기기에서 보이지 않으므로 폴더 트리도 시트에 둔다.
 */

const FOLDER_NAME = "Cheese_QE_Review_Files"; // 드라이브 시안 저장 폴더명
const SHEET_NAME_REVIEWS = "QE_Reviews";      // 검수 프로젝트 목록 시트
const SHEET_NAME_COMMENTS = "QE_Comments";    // 개별 지적사항 시트
const SHEET_NAME_FOLDERS = "QE_Folders";      // 폴더 트리 시트

/**
 * ⚡ [최초 1회 실행 필수] 권한 승인 및 시트/드라이브 초기화 함수
 *
 * 구글 Apps Script 에디터 상단 메뉴에서 [initAuthAndSetup]을 선택하고 [실행] 버튼을 누르세요.
 * 구글의 [권한 검토] > [고급] > [안전하지 않은 페이지로 이동] > [허용]을 완료해야
 * 스프레드시트와 구글 드라이브 접근 차단(Failed to fetch)이 풀립니다!
 */
function initAuthAndSetup() {
  const folder = getOrCreateFolder();
  getOrCreateSheets();
  Logger.log("✅ 권한 승인 및 초기화 완료! 생성된 드라이브 폴더: " + folder.getName());
}

/**
 * 전용 구글 드라이브 폴더 가져오기 (없으면 자동 생성)
 */
function getOrCreateFolder() {
  const folders = DriveApp.getFoldersByName(FOLDER_NAME);
  if (folders.hasNext()) {
    return folders.next();
  }
  const newFolder = DriveApp.createFolder(FOLDER_NAME);
  newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return newFolder;
}

/**
 * 스프레드시트 시트 초기화 (헤더가 없으면 생성)
 */
function getOrCreateSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let reviewSheet = ss.getSheetByName(SHEET_NAME_REVIEWS);
  if (!reviewSheet) {
    reviewSheet = ss.insertSheet(SHEET_NAME_REVIEWS);
    reviewSheet.appendRow([
      "Review ID", "Title", "Folder ID", "Page Count", "Status",
      "Total Comments", "Resolved Count", "Author", "Drive File ID", "Drive File URL", "Updated At"
    ]);
    reviewSheet.setFrozenRows(1);
    reviewSheet.getRange(1, 1, 1, 11).setFontWeight("bold").setBackground("#f1f5f9");
  }

  let commentSheet = ss.getSheetByName(SHEET_NAME_COMMENTS);
  if (!commentSheet) {
    commentSheet = ss.insertSheet(SHEET_NAME_COMMENTS);
    commentSheet.appendRow([
      "Review ID", "Comment ID", "Page", "Type", "X Ratio", "Y Ratio",
      "Width Ratio", "Height Ratio", "Text", "Author", "Resolved", "Created At", "Replies JSON"
    ]);
    commentSheet.setFrozenRows(1);
    commentSheet.getRange(1, 1, 1, 13).setFontWeight("bold").setBackground("#f1f5f9");
  }

  let folderSheet = ss.getSheetByName(SHEET_NAME_FOLDERS);
  if (!folderSheet) {
    folderSheet = ss.insertSheet(SHEET_NAME_FOLDERS);
    folderSheet.appendRow(["Folder ID", "Name", "Parent ID", "Created At"]);
    folderSheet.setFrozenRows(1);
    folderSheet.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#f1f5f9");
  }

  return { reviewSheet, commentSheet, folderSheet };
}

function nowStamp_() {
  return Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm");
}

/**
 * 시트 칸이 날짜 객체로 저장된 경우 한국 시간 문자열로 되돌린다.
 * (그냥 내보내면 UTC ISO 문자열이 내려가 9시간 어긋나 보인다)
 */
function formatStamp_(value) {
  if (!value) return "";
  if (Object.prototype.toString.call(value) === "[object Date]") {
    return Utilities.formatDate(value, "Asia/Seoul", "yyyy-MM-dd HH:mm");
  }
  return String(value);
}

function readReviews_(reviewSheet) {
  const rows = reviewSheet.getDataRange().getValues();
  const reviews = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[0]) continue;
    reviews.push({
      id: String(r[0]),
      title: String(r[1] || ""),
      folderId: String(r[2] || "root"),
      pageCount: Number(r[3]) || 1,
      status: String(r[4] || "in_progress"),
      totalComments: Number(r[5]) || 0,
      resolvedCount: Number(r[6]) || 0,
      author: String(r[7] || ""),
      driveFileId: String(r[8] || ""),
      driveFileUrl: String(r[9] || ""),
      updatedAt: formatStamp_(r[10])
    });
  }
  return reviews;
}

function readFolders_(folderSheet) {
  const rows = folderSheet.getDataRange().getValues();
  const folders = [];
  for (let i = 1; i < rows.length; i++) {
    if (!rows[i][0]) continue;
    folders.push({
      id: String(rows[i][0]),
      name: String(rows[i][1] || ""),
      parentId: String(rows[i][2] || "root"),
      createdAt: formatStamp_(rows[i][3])
    });
  }
  return folders;
}

/** 검수 문서가 들어 있는 줄 번호 (없으면 -1) */
function findReviewRow_(reviewSheet, reviewId) {
  const rows = reviewSheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(reviewId)) return i + 1;
  }
  return -1;
}

/** 특정 문서의 지적사항 줄 제거 (뒤에서부터 지워야 줄 번호가 밀리지 않는다) */
function deleteCommentRows_(commentSheet, reviewId) {
  const rows = commentSheet.getDataRange().getValues();
  for (let i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0]) === String(reviewId)) {
      commentSheet.deleteRow(i + 1);
    }
  }
}

/**
 * POST 요청 처리 (저장, 이동, 삭제, 폴더, 파일 업로드)
 */
function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const mode = body.mode || 'save';
    const sheets = getOrCreateSheets();

    // 1. 구글 드라이브로 시안 원본 파일 업로드 (PC ↔ 모바일 공유 핵심)
    if (mode === 'uploadFile') {
      const reviewId = body.reviewId;
      const fileName = body.fileName || ("시안_" + reviewId);
      const mimeType = body.mimeType || "image/png";
      const base64Data = body.fileBase64; // "data:image/png;base64,..." 또는 순수 base64

      if (!base64Data) {
        return createJsonResponse({ ok: false, error: "파일 데이터(base64)가 없습니다." });
      }

      // data URL 접두사 제거
      const pureBase64 = base64Data.indexOf(",") > -1 ? base64Data.split(",")[1] : base64Data;
      const decodedBytes = Utilities.base64Decode(pureBase64);
      const blob = Utilities.newBlob(decodedBytes, mimeType, fileName);

      const targetFolder = getOrCreateFolder();
      const file = targetFolder.createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      const driveFileId = file.getId();
      const driveFileUrl = "https://drive.google.com/uc?id=" + driveFileId + "&export=download";

      // 업로드는 저장보다 먼저 일어나므로 아직 문서 줄이 없을 수 있다.
      // 줄이 없다고 버리면 Drive File ID가 영영 빈칸으로 남으므로 여기서 줄을 만든다.
      const rowIndex = findReviewRow_(sheets.reviewSheet, reviewId);
      if (rowIndex > 0) {
        sheets.reviewSheet.getRange(rowIndex, 9, 1, 2).setValues([[driveFileId, driveFileUrl]]);
      } else {
        sheets.reviewSheet.appendRow([
          reviewId, body.title || fileName, body.folderId || "root", body.pageCount || 1,
          "in_progress", 0, 0, body.author || "검수 담당자", driveFileId, driveFileUrl, nowStamp_()
        ]);
      }

      return createJsonResponse({
        ok: true,
        driveFileId: driveFileId,
        driveFileUrl: driveFileUrl,
        fileName: fileName,
        message: "구글 드라이브에 시안 파일이 성공적으로 저장되었습니다."
      });
    }

    // 2. 검수 메타데이터 및 지적사항 저장
    if (mode === 'save') {
      const reviewSheet = sheets.reviewSheet;
      const commentSheet = sheets.commentSheet;
      const reviewId = body.id;
      const nowStr = nowStamp_();
      const comments = body.comments || [];
      const total = comments.length;
      const resolved = comments.filter(function(c) { return c.resolved; }).length;
      const status = total > 0 && total === resolved ? "completed" : "in_progress";
      const rowIndex = findReviewRow_(reviewSheet, reviewId);

      let driveFileId = body.driveFileId || "";
      let driveFileUrl = driveFileId ? ("https://drive.google.com/uc?id=" + driveFileId + "&export=download") : "";

      // 드라이브 ID가 안 넘어왔으면 시트에 이미 있는 값을 보존
      if (!driveFileId && rowIndex > 0) {
        const existing = reviewSheet.getRange(rowIndex, 9, 1, 2).getValues()[0];
        driveFileId = String(existing[0] || "");
        driveFileUrl = String(existing[1] || "");
      }

      const reviewData = [
        reviewId,
        body.title || "무제 문서",
        body.folderId || "root",
        body.pageCount || 1,
        status,
        total,
        resolved,
        body.author || "검수 담당자",
        driveFileId,
        driveFileUrl,
        nowStr
      ];

      if (rowIndex > 0) {
        reviewSheet.getRange(rowIndex, 1, 1, 11).setValues([reviewData]);
      } else {
        reviewSheet.appendRow(reviewData);
      }

      // 지적사항은 해당 reviewId 데이터 삭제 후 일괄 재등록
      deleteCommentRows_(commentSheet, reviewId);

      if (comments.length > 0) {
        const rowsToInsert = comments.map(function(c) {
          return [
            reviewId,
            c.id,
            c.page || 1,
            c.type || "error",
            c.xRatio || 0,
            c.yRatio || 0,
            (c.widthRatio === null || c.widthRatio === undefined) ? "" : c.widthRatio,
            (c.heightRatio === null || c.heightRatio === undefined) ? "" : c.heightRatio,
            c.text || "",
            c.author || "검수자",
            c.resolved ? true : false,
            c.createdAt || nowStr,
            JSON.stringify(c.replies || [])
          ];
        });
        commentSheet.getRange(commentSheet.getLastRow() + 1, 1, rowsToInsert.length, 13).setValues(rowsToInsert);
      }

      return createJsonResponse({
        ok: true,
        updatedAt: nowStr,
        driveFileId: driveFileId,
        totalComments: total,
        resolvedCount: resolved
      });
    }

    // 3. 검수 문서 삭제
    if (mode === 'delete') {
      const reviewId = body.id;
      const rowIndex = findReviewRow_(sheets.reviewSheet, reviewId);
      let removedDriveFile = false;

      if (rowIndex > 0) {
        if (body.deleteDriveFile) {
          const driveFileId = String(sheets.reviewSheet.getRange(rowIndex, 9).getValue() || "");
          if (driveFileId) {
            try {
              DriveApp.getFileById(driveFileId).setTrashed(true);
              removedDriveFile = true;
            } catch (driveErr) {
              // 드라이브 파일이 이미 없어도 문서 삭제는 계속 진행
            }
          }
        }
        sheets.reviewSheet.deleteRow(rowIndex);
      }

      deleteCommentRows_(sheets.commentSheet, reviewId);
      return createJsonResponse({ ok: true, deleted: rowIndex > 0, removedDriveFile: removedDriveFile });
    }

    // 4. 문서를 다른 폴더로 이동
    if (mode === 'moveReview') {
      const rowIndex = findReviewRow_(sheets.reviewSheet, body.id);
      if (rowIndex < 0) {
        return createJsonResponse({ ok: false, error: "검수 문서를 시트에서 찾지 못했습니다: " + body.id });
      }
      sheets.reviewSheet.getRange(rowIndex, 3).setValue(body.folderId || "root");
      sheets.reviewSheet.getRange(rowIndex, 11).setValue(nowStamp_());
      return createJsonResponse({ ok: true });
    }

    // 5. 폴더 트리 저장 (폴더 수가 적으므로 전체 교체가 가장 안전하다)
    if (mode === 'saveFolders') {
      const folderSheet = sheets.folderSheet;
      const folders = body.folders || [];
      const lastRow = folderSheet.getLastRow();

      if (lastRow > 1) {
        folderSheet.getRange(2, 1, lastRow - 1, 4).clearContent();
      }
      if (folders.length > 0) {
        const rows = folders.map(function(f) {
          return [f.id, f.name || "", f.parentId || "root", f.createdAt || nowStamp_()];
        });
        folderSheet.getRange(2, 1, rows.length, 4).setValues(rows);
      }

      // 사라진 폴더를 가리키는 문서는 목록에서 영영 안 보이므로 홈으로 끌어올린다
      const validIds = {};
      folders.forEach(function(f) { validIds[f.id] = true; });
      const reviewRows = sheets.reviewSheet.getDataRange().getValues();
      for (let i = 1; i < reviewRows.length; i++) {
        const fid = String(reviewRows[i][2] || "root");
        if (fid !== "root" && !validIds[fid]) {
          sheets.reviewSheet.getRange(i + 1, 3).setValue("root");
        }
      }

      return createJsonResponse({ ok: true, count: folders.length });
    }

    return createJsonResponse({ ok: false, error: "알 수 없는 요청 모드입니다: " + mode });
  } catch (err) {
    return createJsonResponse({ ok: false, error: err.toString() });
  }
}

/**
 * GET 요청 처리 (문서 목록, 폴더, 코멘트 불러오기, 파일 스트리밍)
 */
function doGet(e) {
  try {
    const action = (e && e.parameter && (e.parameter.action || e.parameter.mode)) || 'bootstrap';

    // 0. 시안 파일을 조각으로 내려준다.
    //    몇 MB짜리 PDF를 getFile 로 한 번에 보내면 1분 넘게 걸리거나 브라우저에서 404 로 떨어진다.
    //    드라이브 직접 받기는 브라우저 교차 출처 요청을 막으므로(403) 여기를 거칠 수밖에 없다.
    if (action === 'getFileChunk') {
      const fileId = e.parameter.fileId;
      if (!fileId) {
        return createJsonResponse({ ok: false, error: "fileId가 필요합니다." });
      }

      const offset = Math.max(0, parseInt(e.parameter.offset || "0", 10) || 0);
      const length = Math.min(1048576, Math.max(1, parseInt(e.parameter.length || "716800", 10) || 716800));

      const file = DriveApp.getFileById(fileId);
      const blob = file.getBlob();
      const bytes = blob.getBytes();
      const part = bytes.slice(offset, offset + length);

      return createJsonResponse({
        ok: true,
        fileName: file.getName(),
        mimeType: blob.getContentType(),
        total: bytes.length,
        offset: offset,
        length: part.length,
        base64: Utilities.base64Encode(part)
      });
    }

    // 1. 휴대폰/다른 PC에서 시안 파일 다운로드 (CORS 문제 없는 Base64 Data URL 반환)
    if (action === 'getFile') {
      const fileId = e.parameter.fileId;
      if (!fileId) {
        return createJsonResponse({ ok: false, error: "fileId가 필요합니다." });
      }

      const file = DriveApp.getFileById(fileId);
      const blob = file.getBlob();
      const mimeType = blob.getContentType();
      const base64 = Utilities.base64Encode(blob.getBytes());

      return createJsonResponse({
        ok: true,
        fileName: file.getName(),
        mimeType: mimeType,
        dataUrl: "data:" + mimeType + ";base64," + base64
      });
    }

    // 2. 첫 화면에 필요한 문서 목록 + 폴더 트리를 한 번에 반환
    //    (GAS는 왕복 1~2초라 두 번 부르면 체감 속도가 크게 나빠진다)
    if (action === 'bootstrap') {
      const sheets = getOrCreateSheets();
      return createJsonResponse({
        ok: true,
        reviews: readReviews_(sheets.reviewSheet),
        folders: readFolders_(sheets.folderSheet)
      });
    }

    // 3. 전체 검수 목록 조회
    if (action === 'list') {
      const sheets = getOrCreateSheets();
      return createJsonResponse({ ok: true, reviews: readReviews_(sheets.reviewSheet) });
    }

    // 4. 폴더 트리만 조회
    if (action === 'listFolders') {
      const sheets = getOrCreateSheets();
      return createJsonResponse({ ok: true, folders: readFolders_(sheets.folderSheet) });
    }

    // 5. 특정 문서의 상세 지적사항 조회
    if (action === 'getComments') {
      const reviewId = e.parameter.reviewId || e.parameter.id;
      if (!reviewId) {
        return createJsonResponse({ ok: false, error: "reviewId가 필요합니다." });
      }

      const sheets = getOrCreateSheets();
      const rows = sheets.commentSheet.getDataRange().getValues();
      const comments = [];

      for (let i = 1; i < rows.length; i++) {
        const c = rows[i];
        if (String(c[0]) !== String(reviewId)) continue;

        let replies = [];
        try {
          replies = JSON.parse(c[12] || "[]");
        } catch (parseErr) {
          replies = [];
        }

        comments.push({
          id: Number(c[1]),
          page: Number(c[2]) || 1,
          type: String(c[3] || "error"),
          xRatio: Number(c[4]),
          yRatio: Number(c[5]),
          widthRatio: c[6] === "" ? null : Number(c[6]),
          heightRatio: c[7] === "" ? null : Number(c[7]),
          text: String(c[8] || ""),
          author: String(c[9] || ""),
          resolved: c[10] === true || String(c[10]).toLowerCase() === "true",
          createdAt: formatStamp_(c[11]),
          replies: replies
        });
      }

      return createJsonResponse({ ok: true, comments: comments });
    }

    return createJsonResponse({ ok: false, error: "알 수 없는 요청입니다: " + action });
  } catch (err) {
    return createJsonResponse({ ok: false, error: err.toString() });
  }
}

/**
 * JSON 응답 생성 헬퍼
 */
function createJsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
