// 카페24 ↔ 이카운트 대사(reconciliation) 로직 - 브라우저용 포팅.
// 원본: do-better-workspace-v2/10-projects/11-cafe24-ecount-automation/11.04-Daily_전표입력_웹앱/webapp/src/lib/recon/*.ts
// 로직은 그대로, Node(Buffer) 의존만 브라우저(ArrayBuffer/File)로 교체했다.

// ---------- guide.js ----------
function guideExpected(method, company) {
  var m = method || "";
  var c = (company || "").trim();
  if (m.indexOf("계좌이체") >= 0 || m.indexOf("무통장입금") >= 0) {
    if (c === "토스페이먼츠") return "16. PG(무통장입금)";
    if (c === "뱅크다" || c === "뱅크다 A" || c === "뱅크다A") return "6. 현금영수증(계좌이체)";
    return null;
  }
  if (m.indexOf("신용카드") >= 0) {
    if (c === "토스페이먼츠") return "14. PG(카드)";
    if (c === "토스") return "22.토스페이(카드)";
    if (c === "페이코") return "23.페이코-카드결제(간편)";
    if (c === "카카오페이") return "17.카카오페이";
    return null;
  }
  if (m.indexOf("선불금") >= 0) {
    if (c === "토스") return "27.토스페이(토스머니)";
    if (c === "페이코") return "26.페이코-페이코 포인트";
    if (c === "카카오페이") return "17.카카오페이";
    return null;
  }
  return null;
}

// ---------- markers.js ----------
function isAddon(code) {
  if (code == null) return true;
  var s = String(code);
  if (s === "00001" || s === "00002") return true;
  if (s.indexOf("ONLINE") === 0) return true;
  return false;
}
var DELIVERY_TYPES = ["퀵", "설치", "차량"];
function getMarker(name) {
  if (!name) return null;
  var s = String(name).trim();
  for (var i = 0; i < DELIVERY_TYPES.length; i++) {
    var t = DELIVERY_TYPES[i];
    var re = new RegExp("^\\[?" + t + "\\s*[)\\]]");
    if (re.test(s)) return t;
  }
  return null;
}

// ---------- seonsu.js ----------
function computeSeonsu(fullDate, ecountRows) {
  var orders = {};
  ecountRows.forEach(function (r) {
    var on = String(r["결제일"] || "").trim();
    if (on.indexOf(fullDate) !== 0) return;
    (orders[on] || (orders[on] = [])).push(r);
  });

  var flags = {};
  Object.keys(orders).forEach(function (on) {
    var lines = orders[on];
    function isSeonsuLine(r) {
      return (
        r["품목코드"] === "222222" ||
        (typeof r["품명 및 규격"] === "string" && r["품명 및 규격"].indexOf("선수금") >= 0) ||
        (typeof r["적요"] === "string" && r["적요"].indexOf("선수금") >= 0)
      );
    }
    var seonsuLines = lines.filter(isSeonsuLine);
    var productLines = lines.filter(function (r) {
      return !isAddon(r["품목코드"]);
    });
    var hasSeonsu = seonsuLines.length > 0;
    var seonsuAll = hasSeonsu && (seonsuLines.length >= productLines.length || productLines.length <= 1);
    var seonsuNames = seonsuLines.map(function (r) {
      return String(r["품명 및 규격"] || "").replace("선수금(완납)", "").trim();
    });

    var markerSet = {};
    lines.forEach(function (r) {
      var m = getMarker(r["고객명"]);
      if (m) markerSet[m] = true;
    });
    var markers = Object.keys(markerSet).sort();
    var delivery = markers.join(", ");
    var parts = (hasSeonsu ? ["선수금(발주필요)"] : []).concat(markers);

    flags[on] = { text: parts.join(", "), delivery: delivery, has_seonsu: hasSeonsu, seonsu_all: seonsuAll, seonsu_names: seonsuNames };
  });
  return flags;
}

var ROMAN = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7" };
function tokens(s) {
  var toks = (s || "").toLowerCase().match(/[0-9a-z가-힣]+/g) || [];
  var out = {};
  toks.forEach(function (t) {
    out[ROMAN[t] || t] = true;
  });
  return out;
}
function core(s) {
  var v = (s || "").toLowerCase();
  v = v.replace(/^\s*[[(][^\])]*[\])]\s*/, "");
  v = v.replace(/\b(vii|iii|vi|iv|ii|v|i)\b/g, function (m) {
    return ROMAN[m];
  });
  return v.replace(/[^0-9a-z가-힣]/g, "");
}
function isSubset(a, b) {
  for (var k in a) if (!b[k]) return false;
  return true;
}
function lineMatches(cafe24Product, ecountName) {
  var ctok = tokens(cafe24Product);
  var ntok = tokens(ecountName);
  if (Object.keys(ctok).length >= 2 && isSubset(ctok, ntok)) return true;
  var cc = core(cafe24Product);
  var nc = core(ecountName);
  return cc.length >= 4 && nc.indexOf(cc) >= 0;
}
function seonsuForRow(flag, cafe24Product) {
  if (!flag) return "";
  var parts = [];
  if (flag.has_seonsu) {
    if (flag.seonsu_all) {
      parts.push("선수금(발주필요)");
    } else {
      for (var i = 0; i < flag.seonsu_names.length; i++) {
        if (lineMatches(cafe24Product, flag.seonsu_names[i])) {
          parts.push("선수금(발주필요)");
          break;
        }
      }
    }
  }
  if (flag.delivery) parts = parts.concat(flag.delivery.split(", "));
  return parts.join(", ");
}
function seonsuForGroup(flag, products) {
  var values = products.map(function (p) {
    return seonsuForRow(flag, p);
  });
  var fallbackUsed = false;
  if (flag && flag.has_seonsu && !flag.seonsu_all && !values.some(function (v) { return v.indexOf("선수금") >= 0; })) {
    fallbackUsed = true;
    for (var i = 0; i < values.length; i++) {
      values[i] = values[i] ? "선수금(발주필요), " + values[i] : "선수금(발주필요)";
    }
  }
  return { values: values, fallbackUsed: fallbackUsed };
}

// ---------- parseFiles.js ----------
var STANDARD_REQUIRED_COLS = ["주문번호", "결제수단", "결제업체", "수량", "상품옵션", "공급사명", "상품명(국문 쇼핑몰)", "총 실결제금액(최초정보) (KRW)"];

function parseCafe24Csv(text) {
  text = text.replace(/^﻿/, "");
  var parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  var rows = parsed.data;
  if (rows.length === 0 || !rows[0]["주문번호"]) {
    throw { code: "cafe24_missing_order_col", message: "카페24 파일에서 주문번호 컬럼을 찾을 수 없습니다. 올바른 판매내역 CSV인지 확인해주세요." };
  }
  var header = Object.keys(rows[0]);
  var isStandard = STANDARD_REQUIRED_COLS.every(function (c) {
    return header.indexOf(c) >= 0;
  });
  return { rows: rows, format: isStandard ? "standard" : "reduced" };
}

var ECOUNT_REQUIRED_COLS = ["결제일", "품목코드", "품명 및 규격", "수량", "합 계", "결제유형", "일자"];

async function parseEcountXlsx(arrayBuffer) {
  var wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(arrayBuffer);
  } catch (e) {
    throw { code: "parse_failed", message: "이카운트 파일을 읽을 수 없습니다: " + e.message };
  }
  var ws = wb.worksheets[0];
  if (!ws) throw { code: "parse_failed", message: "이카운트 파일에 시트가 없습니다." };

  var headerLine = String(ws.getRow(1).getCell(1).value || "");
  var headerRow = ws.getRow(2);
  var header = [];
  headerRow.eachCell({ includeEmpty: true }, function (cell, colNumber) {
    header[colNumber - 1] = String(cell.value || "").trim();
  });

  var missing = ECOUNT_REQUIRED_COLS.filter(function (c) {
    return header.indexOf(c) < 0;
  });
  if (missing.indexOf("결제일") >= 0) {
    throw {
      code: "ecount_missing_payment_date_col",
      message: "이카운트 파일에 `결제일` 컬럼이 없습니다. 판매현황(주문번호 매칭 가능한) 리포트로 다시 내보내주세요. (감지된 헤더: \"" + headerLine + "\")",
    };
  }
  if (missing.length > 0) {
    throw { code: "ecount_wrong_report", message: "예상한 판매현황 리포트가 아닌 것 같습니다 (누락된 컬럼: " + missing.join(", ") + "). 헤더: \"" + headerLine + "\"" };
  }

  function idx(name) {
    return header.indexOf(name) + 1;
  }
  var rows = [];
  ws.eachRow(function (row, rowNumber) {
    if (rowNumber <= 2) return;
    var first = row.getCell(1).value;
    var payDate = row.getCell(idx("결제일")).value;
    if (first == null || payDate == null) return;
    var obj = {};
    header.forEach(function (col) {
      if (!col) return;
      obj[col] = row.getCell(idx(col)).value;
    });
    rows.push(obj);
  });
  return { header: header, rows: rows, headerLine: headerLine };
}

// ---------- reconcile.js ----------
function dedupe(list) {
  var seen = {};
  var out = [];
  list.forEach(function (x) {
    if (!seen[x]) {
      seen[x] = true;
      out.push(x);
    }
  });
  return out;
}
function dateFmt(orderNo) {
  var d = orderNo.split("-")[0];
  return d.length === 8 ? d.slice(0, 4) + "-" + d.slice(4, 6) + "-" + d.slice(6, 8) : d;
}
function groupEcountByOrder(ecountRows, fullDate) {
  var orders = {};
  ecountRows.forEach(function (r) {
    var on = String(r["결제일"] || "").trim();
    if (on.indexOf(fullDate) !== 0) return;
    var total = Number(r["합 계"] || 0) || 0;
    if (orders[on]) {
      orders[on].amt += total;
      orders[on].rows.push(r);
    } else {
      orders[on] = { amt: total, rows: [r] };
    }
  });
  return orders;
}

function reconcileStandard(fullDate, cafe24Rows, ecountRows) {
  var cafe24Orders = {};
  cafe24Rows.forEach(function (r) {
    var on = (r["주문번호"] || "").trim();
    if (on.indexOf(fullDate) !== 0) return;
    var amt = parseInt(r["총 실결제금액(최초정보) (KRW)"] || "0", 10);
    if (cafe24Orders[on]) cafe24Orders[on].rows.push(r);
    else cafe24Orders[on] = { amt: amt, rows: [r] };
  });

  var ecountOrders = groupEcountByOrder(ecountRows, fullDate);
  var table = [];

  Object.keys(cafe24Orders)
    .sort()
    .forEach(function (on) {
      var c = cafe24Orders[on];
      var e = ecountOrders[on];

      var supplier = c.rows[0]["공급사명"] || "";
      var productSupplierMap = {};
      var productList = [];
      c.rows.forEach(function (r) {
        var p = r["상품명(국문 쇼핑몰)"];
        if (p && !productSupplierMap.hasOwnProperty(p)) {
          productSupplierMap[p] = r["공급사명"] || "";
          productList.push(p);
        }
      });
      var productSuppliers = productList.map(function (p) {
        return productSupplierMap[p];
      });
      var product = productList.join("\n");
      var cAmt = c.amt;
      var eAmt = e ? e.amt : null;
      var method = c.rows[0]["결제수단"] || "";
      var company = c.rows[0]["결제업체"] || "";
      var options = dedupe(
        c.rows
          .map(function (r) {
            return r["상품옵션"];
          })
          .filter(Boolean)
      )
        .sort()
        .join("; ");

      var status;
      if (!e) {
        var allF = c.rows.every(function (r) {
          return (r["결제구분"] || "") === "F";
        });
        status = allF ? "취소/입금대기 확인필요" : "미입력(누락)";
      } else if (cAmt !== eAmt) {
        status = "금액불일치";
      } else {
        status = "정상";
      }

      var eTypes = e
        ? dedupe(
            e.rows
              .map(function (r) {
                return String(r["결제유형"] || "");
              })
              .filter(Boolean)
          ).sort()
        : [];
      var eTypeStr = eTypes.join(", ");

      var payStatus = "";
      if (e) {
        var expected = guideExpected(method, company);
        if (expected == null) payStatus = "가이드 미명시";
        else if (eTypes.indexOf(expected) >= 0) payStatus = "정상";
        else payStatus = "결제유형확인필요";
      }

      var itemStatus = "",
        qtyStatus = "",
        optStatus = "";
      if (e) {
        var cQty = c.rows.reduce(function (s, r) {
          return s + (parseInt(r["수량"] || "0", 10) || 0);
        }, 0);
        var cCount = c.rows.length;
        var eProductLines = e.rows.filter(function (r) {
          return !isAddon(r["품목코드"]);
        });
        var eQty = eProductLines.reduce(function (s, r) {
          return s + (Number(r["수량"]) || 0);
        }, 0);
        var eCount = eProductLines.length;
        itemStatus = cCount === eCount ? "일치" : "불일치(카페24 " + cCount + "줄/이카운트 " + eCount + "줄)";
        qtyStatus = cQty === eQty ? "일치" : "불일치(카페24 " + cQty + "/이카운트 " + eQty + ")";

        var optVals = [];
        c.rows.forEach(function (r) {
          var opt = r["상품옵션"];
          if (opt) {
            opt.split(/[,;]/).forEach(function (part) {
              var v = part.trim();
              if (v.indexOf("=") >= 0) v = v.split("=", 2)[1].trim();
              if (v) optVals.push(v);
            });
          }
        });
        if (optVals.length === 0) {
          optStatus = "N/A(옵션없음)";
        } else {
          var ecountText = e.rows
            .map(function (r) {
              return String(r["품명 및 규격"] || "");
            })
            .join(" ");
          var found = optVals.filter(function (v) {
            return v && ecountText.indexOf(v) >= 0;
          });
          if (found.length === optVals.length) optStatus = "품명에서 확인됨";
          else if (found.length > 0) optStatus = "일부만 확인됨(" + found.length + "/" + optVals.length + ")";
          else optStatus = "확인불가(이카운트 옵션 미기재)";
        }
      }

      var diff = eAmt != null ? cAmt - eAmt : "";
      table.push({
        order_no: on,
        date: dateFmt(on),
        supplier: supplier,
        product: product,
        product_list: productList,
        product_suppliers: productSuppliers,
        options: options,
        opt_status: optStatus,
        method: method,
        company: company,
        cafe24_amt: cAmt,
        ecount_amt: eAmt == null ? "" : eAmt,
        diff: diff,
        status: status,
        ecount_paytype: eTypeStr,
        pay_status: payStatus,
        item_status: itemStatus,
        qty_status: qtyStatus,
      });
    });

  return table;
}

function reconcileReduced(fullDate, cafe24Rows, ecountRows) {
  var cafe24Orders = {};
  cafe24Rows.forEach(function (r) {
    var on = (r["주문번호"] || "").trim();
    if (on.indexOf(fullDate) !== 0) return;
    var amt = parseInt(r["총 결제금액(KRW)"] || "0", 10);
    if (cafe24Orders[on]) cafe24Orders[on].rows.push(r);
    else cafe24Orders[on] = { amt: amt, rows: [r] };
  });

  var ecountOrders = groupEcountByOrder(ecountRows, fullDate);
  var table = [];

  Object.keys(cafe24Orders)
    .sort()
    .forEach(function (on) {
      var c = cafe24Orders[on];
      var e = ecountOrders[on];

      var supplier = c.rows[0]["공급사명"] || "";
      var productSupplierMap = {};
      var productList = [];
      c.rows.forEach(function (r) {
        var p = r["주문상품명"] || r["주문상품명(기본)"];
        if (p && !productSupplierMap.hasOwnProperty(p)) {
          productSupplierMap[p] = r["공급사명"] || "";
          productList.push(p);
        }
      });
      var productSuppliers = productList.map(function (p) {
        return productSupplierMap[p];
      });
      var product = productList.join("\n");
      var cAmt = c.amt;
      var eAmt = e ? e.amt : null;
      var method = c.rows[0]["결제수단"] || "";

      var status;
      if (!e) {
        var allF = c.rows.every(function (r) {
          return (r["결제구분"] || "") === "F";
        });
        status = allF ? "취소/입금대기 확인필요" : "미입력(누락)";
      } else if (cAmt !== eAmt) {
        status = "금액불일치";
      } else {
        status = "정상";
      }

      var eTypes = e
        ? dedupe(
            e.rows
              .map(function (r) {
                return String(r["결제유형"] || "");
              })
              .filter(Boolean)
          ).sort()
        : [];
      var eTypeStr = eTypes.join(", ");
      var payStatus = e ? "확인불가(결제업체 미기재)" : "";

      var itemStatus = "",
        qtyStatus = "",
        optStatus = "";
      if (e) {
        var cCount = c.rows.length;
        var eProductLines = e.rows.filter(function (r) {
          return !isAddon(r["품목코드"]);
        });
        var eCount = eProductLines.length;
        itemStatus = cCount === eCount ? "일치(줄수 근사, 옵션/수량 컬럼 없음)" : "불일치(카페24 " + cCount + "줄/이카운트 " + eCount + "줄, 줄수 근사)";
        qtyStatus = "확인불가(수량 컬럼 없음)";
        optStatus = "확인불가(상품옵션 컬럼 없음)";
      }

      var diff = eAmt != null ? cAmt - eAmt : "";
      table.push({
        order_no: on,
        date: dateFmt(on),
        supplier: supplier,
        product: product,
        product_list: productList,
        product_suppliers: productSuppliers,
        options: "",
        opt_status: optStatus,
        method: method,
        company: "(미기재)",
        cafe24_amt: cAmt,
        ecount_amt: eAmt == null ? "" : eAmt,
        diff: diff,
        status: status,
        ecount_paytype: eTypeStr,
        pay_status: payStatus,
        item_status: itemStatus,
        qty_status: qtyStatus,
      });
    });

  return table;
}

function reconcile(format, fullDate, cafe24Rows, ecountRows) {
  return format === "standard" ? reconcileStandard(fullDate, cafe24Rows, ecountRows) : reconcileReduced(fullDate, cafe24Rows, ecountRows);
}

// ---------- buildTab.js ----------
function colorRGB(r, g, b) {
  return { red: r / 255, green: g / 255, blue: b / 255 };
}
var COLOR_RED = colorRGB(244, 199, 195);
var COLOR_ORANGE = colorRGB(255, 224, 178);
var COLOR_GRAY = colorRGB(224, 224, 224);
var COLOR_PURPLE = colorRGB(230, 208, 246);
var COLOR_BLUE = colorRGB(207, 226, 255);
var COLOR_YELLOW = colorRGB(255, 245, 157);
var COLOR_MINT = colorRGB(178, 235, 242);

var HEADERS = [
  "확인메모(수기)",
  "선수금/설치",
  "주문번호",
  "주문일자",
  "공급사명",
  "상품명",
  "상품옵션",
  "옵션대조",
  "결제수단",
  "결제업체",
  "카페24 실결제금액",
  "이카운트 합계금액",
  "차액(카페24-이카운트)",
  "금액상태",
  "이카운트 결제유형",
  "결제유형상태",
  "품목대조",
  "수량대조",
];
var NCOL = HEADERS.length;
var MEMO_COL = 0;
var SEONSU_COL = 1;
var COL_DATE = 3;
var COL_AMT_START = 10;
var COL_AMT_END = 13;

// sheetId는 브라우저에서 모르므로 placeholder 0 사용 - Apps Script가 실제 sheetId로 치환한다.
function buildDateTab(dateDisplay, fullDate, rows, seonsu, extraNote) {
  extraNote = extraNote || "";
  var sheetId = 0;
  var missing = rows.filter(function (r) { return r.status === "미입력(누락)"; }).length;
  var mismatch = rows.filter(function (r) { return r.status === "금액불일치"; }).length;
  var cancelCheck = rows.filter(function (r) { return r.status === "취소/입금대기 확인필요"; }).length;
  var payMismatch = rows.filter(function (r) { return r.pay_status === "결제유형확인필요"; }).length;
  var itemMismatch = rows.filter(function (r) { return r.item_status && r.item_status.indexOf("일치") !== 0; }).length;
  var missingAmt = rows.filter(function (r) { return r.status === "미입력(누락)"; }).reduce(function (s, r) { return s + r.cafe24_amt; }, 0);
  var ok = rows.length - missing - mismatch - cancelCheck;

  var statLine =
    "전체 " + rows.length + "건 | 정상 " + ok + "건 | 미입력(누락) " + missing + "건(" + missingAmt.toLocaleString() + "원) | " +
    "금액불일치 " + mismatch + "건 | 취소/입금대기 확인필요 " + cancelCheck + "건 | 결제유형확인필요 " + payMismatch + "건 | " +
    "품목/수량불일치 " + itemMismatch + "건 - 카페24 " + dateDisplay + " 주문 기준, 이카운트는 주문번호가 " + fullDate + "로 시작하는 항목만 집계" + extraNote;
  var legend =
    "확인메모(수기)=A열, 담당자가 여기에 입력하면 자동으로 노랑 표시 - 빨강=미입력 / 주황=금액불일치 / " +
    "보라=품목,수량불일치 / 파랑=결제유형확인필요(가이드 3-5p 기준) / 회색=취소/입금대기 확인필요(카페24 결제구분=F) / 흰색=정상 - " +
    "B열(선수금/설치)=이카운트 고객명이 선수금(발주필요)/퀵)/설치)/차량)로 표기된 건, 채워지면 민트 표시 - " +
    "한 주문에 품목이 여러 개면 상품명(F열)마다 별도 행으로 표시(나머지 값은 동일하게 반복, 건수는 행 수가 아니라 주문 수 기준)";

  var values = [];
  values.push([ "카페24-이카운트 대사 - " + dateDisplay ].concat(Array(NCOL - 1).fill("")));
  values.push([statLine].concat(Array(NCOL - 1).fill("")));
  values.push([legend].concat(Array(NCOL - 1).fill("")));
  values.push(HEADERS.slice());

  var groupSizes = [];
  var warnings = [];

  rows.forEach(function (t) {
    var products = t.product_list.length ? t.product_list : [t.product || ""];
    groupSizes.push(Math.max(1, products.length));
    var r = seonsuForGroup(seonsu[t.order_no], products);
    if (r.fallbackUsed) {
      warnings.push(t.order_no + " 선수금 라인 매칭 실패 -> 전 행에 표기(fallback). 이카운트 품명: " + JSON.stringify((seonsu[t.order_no] || {}).seonsu_names));
    }
    products.forEach(function (p, i) {
      values.push([
        "",
        r.values[i],
        t.order_no,
        t.date,
        t.product_suppliers[i] != null ? t.product_suppliers[i] : t.supplier,
        p,
        t.options,
        t.opt_status,
        t.method,
        t.company,
        t.cafe24_amt,
        t.ecount_amt,
        t.diff,
        t.status,
        t.ecount_paytype,
        t.pay_status,
        t.item_status,
        t.qty_status,
      ]);
    });
  });

  var dataStart = 4;
  var totalDataRows = groupSizes.reduce(function (a, b) { return a + b; }, 0);
  var requests = [];

  requests.push({ repeatCell: { range: { sheetId: sheetId, startRowIndex: 0, endRowIndex: 500, startColumnIndex: 0, endColumnIndex: 26 }, cell: { userEnteredFormat: {} }, fields: "userEnteredFormat" } });
  requests.push({ unmergeCells: { range: { sheetId: sheetId, startRowIndex: 0, endRowIndex: 500, startColumnIndex: 0, endColumnIndex: 26 } } });
  requests.push({
    repeatCell: { range: { sheetId: sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: NCOL }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 13 } } }, fields: "userEnteredFormat.textFormat" },
  });
  [[0, 1], [1, 2], [2, 3]].forEach(function (pair) {
    requests.push({ mergeCells: { range: { sheetId: sheetId, startRowIndex: pair[0], endRowIndex: pair[1], startColumnIndex: 0, endColumnIndex: NCOL }, mergeType: "MERGE_ALL" } });
  });
  requests.push({
    repeatCell: { range: { sheetId: sheetId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 0, endColumnIndex: NCOL }, cell: { userEnteredFormat: { textFormat: { italic: true, foregroundColor: colorRGB(102, 102, 102) } } }, fields: "userEnteredFormat.textFormat" },
  });
  requests.push({
    repeatCell: {
      range: { sheetId: sheetId, startRowIndex: 3, endRowIndex: 4, startColumnIndex: 0, endColumnIndex: NCOL },
      cell: { userEnteredFormat: { backgroundColor: colorRGB(66, 66, 66), textFormat: { bold: true, foregroundColor: colorRGB(255, 255, 255) }, horizontalAlignment: "CENTER" } },
      fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)",
    },
  });

  var rowIdx = dataStart;
  for (var i = 0; i < rows.length; i++) {
    var t = rows[i];
    var gsize = groupSizes[i];
    var bg = null;
    if (t.status === "미입력(누락)") bg = COLOR_RED;
    else if (t.status === "금액불일치") bg = COLOR_ORANGE;
    else if (t.status === "취소/입금대기 확인필요") bg = COLOR_GRAY;
    else if (t.item_status && t.item_status.indexOf("일치") !== 0) bg = COLOR_PURPLE;
    else if (t.pay_status === "결제유형확인필요") bg = COLOR_BLUE;
    if (bg) {
      requests.push({
        repeatCell: { range: { sheetId: sheetId, startRowIndex: rowIdx, endRowIndex: rowIdx + gsize, startColumnIndex: 0, endColumnIndex: NCOL }, cell: { userEnteredFormat: { backgroundColor: bg } }, fields: "userEnteredFormat.backgroundColor" },
      });
    }
    rowIdx += gsize;
  }

  requests.push({
    repeatCell: { range: { sheetId: sheetId, startRowIndex: dataStart, endRowIndex: dataStart + totalDataRows, startColumnIndex: COL_AMT_START, endColumnIndex: COL_AMT_END }, cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "#,##0" } } }, fields: "userEnteredFormat.numberFormat" },
  });
  requests.push({
    repeatCell: { range: { sheetId: sheetId, startRowIndex: dataStart, endRowIndex: dataStart + totalDataRows, startColumnIndex: COL_DATE, endColumnIndex: COL_DATE + 1 }, cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "yyyy-mm-dd" } } }, fields: "userEnteredFormat.numberFormat" },
  });
  requests.push({ updateSheetProperties: { properties: { sheetId: sheetId, gridProperties: { frozenRowCount: 4 } }, fields: "gridProperties.frozenRowCount" } });

  var widths = [220, 170, 140, 100, 110, 340, 170, 150, 130, 100, 110, 110, 100, 100, 160, 180, 180, 180];
  widths.forEach(function (w, i) {
    requests.push({ updateDimensionProperties: { range: { sheetId: sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 }, properties: { pixelSize: w }, fields: "pixelSize" } });
  });

  var endRow = dataStart + totalDataRows;
  requests.push({
    addConditionalFormatRule: { rule: { ranges: [{ sheetId: sheetId, startRowIndex: dataStart, endRowIndex: endRow, startColumnIndex: MEMO_COL, endColumnIndex: MEMO_COL + 1 }], booleanRule: { condition: { type: "NOT_BLANK" }, format: { backgroundColor: COLOR_YELLOW } } }, index: 0 },
  });
  requests.push({
    addConditionalFormatRule: { rule: { ranges: [{ sheetId: sheetId, startRowIndex: dataStart, endRowIndex: endRow, startColumnIndex: SEONSU_COL, endColumnIndex: SEONSU_COL + 1 }], booleanRule: { condition: { type: "NOT_BLANK" }, format: { backgroundColor: COLOR_MINT, textFormat: { bold: true } } } }, index: 0 },
  });

  return { values: values, requests: requests, orderCount: rows.length, rowCount: totalDataRows, warnings: warnings };
}

function computeResultSummary(rows, format) {
  var missing = rows.filter(function (r) { return r.status === "미입력(누락)"; }).length;
  var missingAmt = rows.filter(function (r) { return r.status === "미입력(누락)"; }).reduce(function (s, r) { return s + r.cafe24_amt; }, 0);
  var mismatch = rows.filter(function (r) { return r.status === "금액불일치"; }).length;
  var cancelCheck = rows.filter(function (r) { return r.status === "취소/입금대기 확인필요"; }).length;
  return {
    total: rows.length,
    ok: rows.length - missing - mismatch - cancelCheck,
    missing: missing,
    missingAmt: missingAmt,
    mismatch: mismatch,
    cancelCheck: cancelCheck,
    payMismatch: rows.filter(function (r) { return r.pay_status === "결제유형확인필요"; }).length,
    itemQtyMismatch: rows.filter(function (r) { return r.item_status && r.item_status.indexOf("일치") !== 0; }).length,
    format: format,
  };
}
