/* NAC Bookmarklet (HRMS table scraper)
 *
 * Fix: HRMS matrix rows like OutTime/Status/WorkedHour often omit leading cells
 * (SN/Emp ID/Name/Post) and start directly from the Time column. When that happens,
 * naïve index-based scraping shifts values into earlier day columns.
 *
 * This version detects that layout and applies a per-row offset so day columns line up
 * exactly with the header indices.
 */
(function () {
  if (window.nacBookmarkletActive) {
    alert("NAC Sync already active");
    return;
  }
  window.nacBookmarkletActive = true;

  function waitForTables(cb, wait) {
    var start = Date.now();
    function chk() {
      var t = document.querySelectorAll("table");
      if (t.length > 0 || Date.now() - start > wait) cb(t);
      else setTimeout(chk, 100);
    }
    chk();
  }

  function cellText(c) {
    if (!c) return "";
    var t = (c.textContent || "").trim();
    if (t) return t;
    return (c.innerText || "").trim();
  }

  function normalizeTimeType(label) {
    if (!label) return null;
    var s = String(label).toLowerCase().trim();
    if (s === "intime" || s === "in time" || s === "in") return "InTime";
    if (s === "outtime" || s === "out time" || s === "out") return "OutTime";
    if (s === "status") return "Status";
    if (s === "workedhour" || s === "worked hour" || s === "workhour" || s === "work hour" || s === "hours")
      return "WorkedHour";
    return null;
  }

  function scrapeMatrixTable(tbl) {
    var body = tbl.querySelector("tbody") || tbl;
    var rows = Array.from(body.querySelectorAll("tr"));
    if (rows.length < 2) return null;

    var headerRow = rows[0];
    var headers = Array.from(headerRow.querySelectorAll("th,td")).map(cellText);
    var timeColIdx = headers.indexOf("Time");
    if (timeColIdx === -1) return null;

    var snIdx = headers.indexOf("SN.");
    var empIdIdx = headers.indexOf("Emp ID");
    var nameIdx = headers.indexOf("Name");
    var postIdx = headers.indexOf("Post");

    var excluded = ["Annual  Leave", "Sick Leave", "Other Leaves", "Casual Leave", "Substitute Leave Opening", "Absent"];
    var dayHeaders = [];
    for (var i = 0; i < headers.length; i++) {
      if (i === snIdx || i === empIdIdx || i === nameIdx || i === postIdx || i === timeColIdx) continue;
      if (!headers[i]) continue;
      if (excluded.includes(headers[i])) continue;
      dayHeaders.push({ idx: i, name: headers[i] });
    }

    var employees = {};
    var currentEmp = null;

    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      var cells = Array.from(row.querySelectorAll("th,td"));
      if (cells.length === 0) continue;

      /* Detect "row starts at Time column" layout */
      var offset = 0;
      var first = cellText(cells[0]);
      if (cells.length < headers.length && normalizeTimeType(first) && timeColIdx > 0) offset = timeColIdx;

      function getByHeaderIndex(headerIdx) {
        var j = headerIdx - offset;
        if (j < 0 || j >= cells.length) return "";
        return cellText(cells[j]);
      }

      var snVal = snIdx >= 0 ? getByHeaderIndex(snIdx) : "";
      var empIdVal = empIdIdx >= 0 ? getByHeaderIndex(empIdIdx) : "";
      var nameVal = nameIdx >= 0 ? getByHeaderIndex(nameIdx) : "";
      var postVal = postIdx >= 0 ? getByHeaderIndex(postIdx) : "";

      var timeLabel = getByHeaderIndex(timeColIdx);
      var timeType = normalizeTimeType(timeLabel) || "InTime";

      var hasEmpInfo = (snVal && !isNaN(parseInt(snVal))) || empIdVal || nameVal;
      if (hasEmpInfo) {
        if (currentEmp && currentEmp.key) employees[currentEmp.key] = currentEmp.data;
        currentEmp = {
          key: empIdVal || nameVal || snVal,
          data: { SN: snVal, EmpID: empIdVal, Name: nameVal, Post: postVal, times: {} },
        };
      }
      if (!currentEmp) continue;

      var hasDayData = false;
      var dayValues = {};
      dayHeaders.forEach(function (day) {
        var v = getByHeaderIndex(day.idx);
        if (v) {
          hasDayData = true;
          dayValues[day.name] = v;
        }
      });
      if (!hasDayData) continue;

      if (!currentEmp.data.times[timeType]) currentEmp.data.times[timeType] = {};
      Object.keys(dayValues).forEach(function (dayName) {
        currentEmp.data.times[timeType][dayName] = dayValues[dayName];
      });
    }

    if (currentEmp && currentEmp.key) employees[currentEmp.key] = currentEmp.data;

    var allTimeTypes = new Set();
    Object.keys(employees).forEach(function (empKey) {
      Object.keys(employees[empKey].times).forEach(function (tt) {
        allTimeTypes.add(tt);
      });
    });
    allTimeTypes = Array.from(allTimeTypes);

    var resultHeaders = ["SN.", "Emp ID", "Name", "Post"];
    dayHeaders.forEach(function (day) {
      allTimeTypes.forEach(function (tt) {
        resultHeaders.push(day.name + "_" + tt);
      });
    });

    var resultData = [];
    Object.keys(employees).forEach(function (empKey) {
      var emp = employees[empKey];
      var outRow = { SN: emp.SN || "", EmpID: emp.EmpID || "", Name: emp.Name || "", Post: emp.Post || "" };
      dayHeaders.forEach(function (day) {
        allTimeTypes.forEach(function (tt) {
          var key = day.name + "_" + tt;
          outRow[key] = emp.times[tt] && emp.times[tt][day.name] ? emp.times[tt][day.name] : "";
        });
      });
      resultData.push(outRow);
    });

    return { headers: resultHeaders, data: resultData };
  }

  function scrape() {
    var t = document.querySelectorAll("table");
    if (t.length === 0) return { error: "No tables found" };

    var r = [];
    t.forEach(function (tbl, idx) {
      if (tbl.offsetParent === null && tbl.style.display === "none") return;

      var matrixResult = scrapeMatrixTable(tbl);
      if (matrixResult) {
        r.push({ idx: idx, h: matrixResult.headers, d: matrixResult.data, cnt: matrixResult.data.length });
        return;
      }

      var body = tbl.querySelector("tbody") || tbl;
      var rows = Array.from(body.querySelectorAll("tr"));
      if (rows.length === 0) return;

      var h = [];
      var fr = rows[0];
      if (fr) {
        var hc = Array.from(fr.querySelectorAll("th,td"));
        if (hc.length > 0) h = hc.map(function (cell, i) { return cellText(cell) || "Col" + (i + 1); });
      }
      if (h.length === 0 && rows.length > 1) {
        var sr = rows[1];
        if (sr) h = Array.from(sr.querySelectorAll("td")).map(function (_cell, i) { return "Col" + (i + 1); });
      }

      var d = [];
      for (var i = 1; i < rows.length; i++) {
        var row = rows[i];
        var cells = Array.from(row.querySelectorAll("td"));
        if (cells.length === 0) continue;
        var rd = {};
        cells.forEach(function (cell, j) {
          var hdr = h[j] || "Col" + (j + 1);
          rd[hdr] = cellText(cell) || "";
        });
        if (Object.keys(rd).length > 0) d.push(rd);
      }
      if (d.length > 0) r.push({ idx: idx, h: h, d: d, cnt: d.length });
    });

    if (r.length === 0) return { error: "No data rows" };
    return { ok: true, tables: r };
  }

  function hl(tbl) {
    var o = tbl.style.outline;
    tbl.style.outline = "3px solid #d32c3c";
    tbl.style.outlineOffset = "2px";
    setTimeout(function () {
      tbl.style.outline = o;
      tbl.style.outlineOffset = "";
    }, 2000);
  }

  function parseBaseUrl(input) {
    var url = input.trim();
    if (!url) return null;
    if (url.includes("://")) {
      try {
        var u = new URL(url);
        return u.protocol + "//" + u.host;
      } catch (e) {
        return null;
      }
    }
    var cleaned = url.replace(/\/.*$/, "").split("?")[0].split("#")[0];
    if (cleaned.includes(":")) return "http://" + cleaned;
    return "https://" + cleaned;
  }

  var defaultUrl = "http://localhost:3000";
  var promptMsg =
    "Enter your NAC app URL (e.g., http://localhost:3000 or https://your-app.com). IMPORTANT: Enter NAC app URL, NOT the HRMS page URL!";
  var urlInput = prompt(promptMsg, defaultUrl);
  if (!urlInput) {
    window.nacBookmarkletActive = false;
    return;
  }
  var base = parseBaseUrl(urlInput);
  if (!base) {
    alert("Invalid URL format. Please enter a valid URL like http://localhost:3000");
    window.nacBookmarkletActive = false;
    return;
  }

  waitForTables(function (tbls) {
    if (tbls.length === 0) {
      alert("No tables found");
      window.nacBookmarkletActive = false;
      return;
    }
    var res = scrape();
    if (res.error) {
      alert("Error: " + res.error);
      window.nacBookmarkletActive = false;
      return;
    }
    if (res.ok && res.tables.length > 0) {
      res.tables.forEach(function (t, idx) {
        var tbls = document.querySelectorAll("table");
        if (tbls[idx]) hl(tbls[idx]);
      });
      var tot = res.tables.reduce(function (s, t) { return s + t.cnt; }, 0);
      var m = "Found " + res.tables.length + " table(s) with " + tot + " rows. Sync?";
      if (!confirm(m)) {
        window.nacBookmarkletActive = false;
        return;
      }
      var receiverUrl = base + "/app/bookmarklet-receiver";
      var popup = window.open(receiverUrl, "nacBookmarklet", "width=500,height=400,resizable=yes,scrollbars=yes");
      if (!popup) {
        alert("Popup blocked! Please allow popups for this site and try again.");
        window.nacBookmarkletActive = false;
        return;
      }
      function sendData() {
        if (popup.closed) {
          alert("Popup was closed. Please try again.");
          window.nacBookmarkletActive = false;
          return;
        }
        try {
          popup.postMessage(
            { type: "NAC_BOOKMARKLET_DATA", tables: res.tables, sourceUrl: window.location.href, timestamp: new Date().toISOString() },
            base,
          );
          setTimeout(function () { if (!popup.closed) popup.focus(); }, 500);
        } catch (e) {
          alert("Error sending data. Please try again.");
          window.nacBookmarkletActive = false;
        }
      }
      var checkReady = setInterval(function () {
        try {
          if (popup.closed) {
            clearInterval(checkReady);
            window.nacBookmarkletActive = false;
            return;
          }
          popup.postMessage({ type: "NAC_BOOKMARKLET_PING" }, base);
        } catch (e) {
          clearInterval(checkReady);
        }
      }, 250);
      window.addEventListener("message", function (e) {
        if (e.origin !== base.replace(/\/$/, "")) return;
        if (e.data && e.data.type === "NAC_BOOKMARKLET_READY") {
          clearInterval(checkReady);
          sendData();
          window.nacBookmarkletActive = false;
        }
      });
      setTimeout(function () {
        clearInterval(checkReady);
        if (!popup.closed) {
          sendData();
          window.nacBookmarkletActive = false;
        }
      }, 3000);
    }
  }, 3000);
})();
