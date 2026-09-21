/**
 * Cheese QE Review System - Google Apps Script (GAS) Backend
 * 
 * 기능:
 * 1. 구글 드라이브(Google Drive)에 고용량 시안(이미지/PDF) 자동 업로드 및 공유 링크 생성
 *    - 휴대폰과 컴퓨터 어느 기기에서든 동일한 원본 시안을 열 수 있도록 지원
 * 2. 구글 스프레드시트(Google Sheets)에 검수 지적사항, 핀 위치, 상태 양방향 동기화
 * 3. 기기 간 CORS 이슈 없는 안전한 시안 파일 Base64 스트리밍 (doGet)
 */

const FOLDER_NAME = "Cheese_QE_Review_Files"; // 드라이브 시안 저장 폴더명
const SHEET_NAME_REVIEWS = "QE_Reviews";      // 검수 프로젝트 목록 시트
const SHEET_NAME_COMMENTS = "QE_Comments";    // 개별 지적사항 시트

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

  return { reviewSheet, commentSheet };
}

/**
 * POST 요청 처리 (저장, 파일 업로드)
 */
function doPost(e) {
  try {
    const rawData = e.postData.contents;
    const body = JSON.parse(rawData);
    const mode = body.mode || 'save';

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

      // 스프레드시트의 해당 리뷰 행에 driveFileId 기록
      const { reviewSheet } = getOrCreateSheets();
      const data = reviewSheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === reviewId) {
          reviewSheet.getRange(i + 1, 9).setValue(driveFileId);
          reviewSheet.getRange(i + 1, 10).setValue(driveFileUrl);
          break;
        }
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
      const { reviewSheet, commentSheet } = getOrCreateSheets();
      const reviewId = body.id;
      const nowStr = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm");
      const comments = body.comments || [];
      const total = comments.length;
      const resolved = comments.filter(c => c.resolved).length;
      const status = total > 0 && total === resolved ? "completed" : "in_progress";
      const driveFileId = body.driveFileId || "";
      const driveFileUrl = driveFileId ? ("https://drive.google.com/uc?id=" + driveFileId + "&export=download") : "";

      // A. QE_Reviews 시트 업데이트/추가
      const reviewRows = reviewSheet.getDataRange().getValues();
      let rowIndex = -1;
      for (let i = 1; i < reviewRows.length; i++) {
        if (reviewRows[i][0] === reviewId) {
          rowIndex = i + 1;
          break;
        }
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
        // 기존 행 유지하되 driveFileId가 넘어오지 않은 경우 기존 드라이브 파일 ID 보존
        if (!driveFileId && reviewRows[rowIndex - 1][8]) {
          reviewData[8] = reviewRows[rowIndex - 1][8];
          reviewData[9] = reviewRows[rowIndex - 1][9];
        }
        reviewSheet.getRange(rowIndex, 1, 1, 11).setValues([reviewData]);
      } else {
        reviewSheet.appendRow(reviewData);
      }

      // B. QE_Comments 시트 업데이트 (기존 해당 reviewId 데이터 삭제 후 일괄 재등록)
      const commentData = commentSheet.getDataRange().getValues();
      for (let i = commentData.length - 1; i >= 1; i--) {
        if (commentData[i][0] === reviewId) {
          commentSheet.deleteRow(i + 1);
        }
      }

      if (comments.length > 0) {
        const rowsToInsert = comments.map(c => [
          reviewId,
          c.id,
          c.page || 1,
          c.type || "error",
          c.xRatio || 0,
          c.yRatio || 0,
          c.widthRatio || "",
          c.heightRatio || "",
          c.text || "",
          c.author || "검수자",
          c.resolved ? true : false,
          c.createdAt || nowStr,
          JSON.stringify(c.replies || [])
        ]);
        commentSheet.getRange(commentSheet.getLastRow() + 1, 1, rowsToInsert.length, 13).setValues(rowsToInsert);
      }

      return createJsonResponse({
        ok: true,
        updatedAt: nowStr,
        totalComments: total,
        resolvedCount: resolved
      });
    }

    return createJsonResponse({ ok: false, error: "알 수 없는 요청 모드입니다: " + mode });
  } catch (err) {
    return createJsonResponse({ ok: false, error: err.toString() });
  }
}

/**
 * GET 요청 처리 (문서 목록, 코멘트 불러오기, 파일 스트리밍)
 */
function doGet(e) {
  try {
    const action = e.parameter.action || e.parameter.mode || 'list';

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
      const dataUrl = "data:" + mimeType + ";base64," + base64;

      return createJsonResponse({
        ok: true,
        fileName: file.getName(),
        mimeType: mimeType,
        dataUrl: dataUrl
      });
    }

    // 2. 전체 검수 목록 조회 (스프레드시트 -> 클라이언트)
    if (action === 'list') {
      const { reviewSheet } = getOrCreateSheets();
      const rows = reviewSheet.getDataRange().getValues();
      const reviews = [];

      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r[0]) continue;
        reviews.push({
          id: r[0],
          title: r[1],
          folderId: r[2],
          pageCount: Number(r[3]) || 1,
          status: r[4],
          totalComments: Number(r[5]) || 0,
          resolvedCount: Number(r[6]) || 0,
          author: r[7],
          driveFileId: r[8] || "",
          driveFileUrl: r[9] || "",
          updatedAt: r[10]
        });
      }

      return createJsonResponse({ ok: true, reviews: reviews });
    }

    // 3. 특정 문서의 상세 코멘트 목록 조회
    if (action === 'getComments') {
      const reviewId = e.parameter.reviewId;
      if (!reviewId) {
        return createJsonResponse({ ok: false, error: "reviewId가 필요합니다." });
      }

      const { commentSheet } = getOrCreateSheets();
      const rows = commentSheet.getDataRange().getValues();
      const comments = [];

      for (let i = 1; i < rows.length; i++) {
        const c = rows[i];
        if (c[0] === reviewId) {
          let replies = [];
          try {
            replies = JSON.parse(c[12] || "[]");
          } catch(e) { replies = []; }

          comments.push({
            id: Number(c[1]),
            page: Number(c[2]) || 1,
            type: c[3],
            xRatio: Number(c[4]),
            yRatio: Number(c[5]),
            widthRatio: c[6] !== "" ? Number(c[6]) : null,
            heightRatio: c[7] !== "" ? Number(c[7]) : null,
            text: c[8],
            author: c[9],
            resolved: Boolean(c[10]),
            createdAt: c[11],
            replies: replies
          });
        }
      }

      return createJsonResponse({ ok: true, comments: comments });
    }

    return createJsonResponse({ ok: true, message: "Cheese QE Review Backend is running." });
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
