(function () {
  "use strict";

  function fmtINR(n) {
    if (!isFinite(n)) return "—";
    return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  }
  function fmtNum(n, digits) {
    if (!isFinite(n)) return "—";
    return n.toLocaleString("en-IN", { maximumFractionDigits: digits == null ? 2 : digits });
  }

  function fieldWrap(el) {
    return el.closest(".field");
  }

  function clearError(el) {
    var wrap = fieldWrap(el);
    if (!wrap) return;
    wrap.classList.remove("has-error");
    var err = wrap.querySelector(".field-error");
    if (err) err.textContent = "";
  }

  function setError(el, message) {
    var wrap = fieldWrap(el);
    if (!wrap) return;
    wrap.classList.add("has-error");
    var err = wrap.querySelector(".field-error");
    if (err) err.textContent = message;
  }

  // Returns a number, or null (and sets an inline error) if invalid.
  function readNumber(el, opts) {
    opts = opts || {};
    clearError(el);
    var raw = (el.value || "").trim();
    if (raw === "") {
      setError(el, "Please enter a value.");
      return null;
    }
    var val = parseFloat(raw);
    if (isNaN(val)) {
      setError(el, "Please enter a valid number.");
      return null;
    }
    if (opts.min !== undefined && val < opts.min) {
      setError(el, "Value should be " + opts.min + " or more.");
      return null;
    }
    if (opts.max !== undefined && val > opts.max) {
      setError(el, "Value should be " + opts.max + " or less.");
      return null;
    }
    return val;
  }

  function toggleGroup(container, hiddenInput) {
    var buttons = container.querySelectorAll("button[data-value]");
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        buttons.forEach(function (b) {
          b.classList.remove("is-active");
        });
        btn.classList.add("is-active");
        hiddenInput.value = btn.getAttribute("data-value");
      });
    });
  }

  function resultRow(label, value, opts) {
    opts = opts || {};
    return (
      '<div class="result-row' +
      (opts.hero ? " result-hero" : "") +
      '"><span class="label">' +
      label +
      '</span><span class="value">' +
      value +
      "</span></div>"
    );
  }

  // ------------------------------------------------------------- Percentage
  function calcPercentage(form, out) {
    var obtained = readNumber(document.getElementById("pctObtained"), { min: 0 });
    var total = readNumber(document.getElementById("pctTotal"), { min: 0.0001 });
    if (obtained === null || total === null) return;
    if (obtained > total) {
      setError(document.getElementById("pctObtained"), "Obtained value can't be more than the total.");
      return;
    }
    var pct = (obtained / total) * 100;
    out.innerHTML =
      resultRow("Percentage", fmtNum(pct) + "%", { hero: true }) +
      resultRow("Calculation", fmtNum(obtained, 2) + " ÷ " + fmtNum(total, 2) + " × 100");
  }

  // ------------------------------------------------------------- EMI
  function calcEMI(form, out) {
    var amount = readNumber(document.getElementById("emiAmount"), { min: 1 });
    var rate = readNumber(document.getElementById("emiRate"), { min: 0, max: 100 });
    var tenureVal = readNumber(document.getElementById("emiTenureValue"), { min: 1 });
    if (amount === null || rate === null || tenureVal === null) return;
    var unit = document.getElementById("emiTenureUnit").value || "years";
    var months = unit === "years" ? tenureVal * 12 : tenureVal;
    var monthlyRate = rate / 12 / 100;

    var emi;
    if (monthlyRate === 0) {
      emi = amount / months;
    } else {
      var factor = Math.pow(1 + monthlyRate, months);
      emi = (amount * monthlyRate * factor) / (factor - 1);
    }
    var totalPayment = emi * months;
    var totalInterest = totalPayment - amount;

    out.innerHTML =
      resultRow("Monthly EMI", fmtINR(emi), { hero: true }) +
      resultRow("Total interest payable", fmtINR(totalInterest)) +
      resultRow("Total repayment (principal + interest)", fmtINR(totalPayment)) +
      resultRow("Number of instalments", months + " months");
  }

  // ------------------------------------------------------------- GST
  function calcGST(form, out) {
    var amount = readNumber(document.getElementById("gstAmount"), { min: 0 });
    if (amount === null) return;
    var rateSelect = document.getElementById("gstRate");
    var rate = parseFloat(rateSelect.value);
    if (rateSelect.value === "custom") {
      rate = readNumber(document.getElementById("gstRateCustom"), { min: 0, max: 100 });
      if (rate === null) return;
    }
    var mode = document.getElementById("gstMode").value || "add";

    if (mode === "add") {
      var gstAmt = (amount * rate) / 100;
      var finalAmt = amount + gstAmt;
      out.innerHTML =
        resultRow("Final amount (with GST)", fmtINR(finalAmt), { hero: true }) +
        resultRow("GST amount (" + fmtNum(rate) + "%)", fmtINR(gstAmt)) +
        resultRow("Original amount", fmtINR(amount));
    } else {
      var base = amount / (1 + rate / 100);
      var gstPart = amount - base;
      out.innerHTML =
        resultRow("Original amount (before GST)", fmtINR(base), { hero: true }) +
        resultRow("GST amount removed (" + fmtNum(rate) + "%)", fmtINR(gstPart)) +
        resultRow("Amount you entered", fmtINR(amount));
    }
  }

  // ------------------------------------------------------------- Age
  function calcAge(form, out) {
    var dobEl = document.getElementById("ageDob");
    clearError(dobEl);
    if (!dobEl.value) {
      setError(dobEl, "Please choose a date of birth.");
      return;
    }
    var dob = new Date(dobEl.value + "T00:00:00");
    var asOfEl = document.getElementById("ageAsOf");
    var asOf = asOfEl.value ? new Date(asOfEl.value + "T00:00:00") : new Date();
    asOf.setHours(0, 0, 0, 0);

    if (dob > asOf) {
      setError(dobEl, "Date of birth can't be after the comparison date.");
      return;
    }

    var years = asOf.getFullYear() - dob.getFullYear();
    var months = asOf.getMonth() - dob.getMonth();
    var days = asOf.getDate() - dob.getDate();

    if (days < 0) {
      months -= 1;
      var prevMonth = new Date(asOf.getFullYear(), asOf.getMonth(), 0);
      days += prevMonth.getDate();
    }
    if (months < 0) {
      years -= 1;
      months += 12;
    }

    var totalDays = Math.round((asOf - dob) / (1000 * 60 * 60 * 24));

    out.innerHTML =
      resultRow("Age", years + " years, " + months + " months, " + days + " days", { hero: true }) +
      resultRow("Total days lived", fmtNum(totalDays, 0) + " days");
  }

  // ------------------------------------------------------------- Discount
  function calcDiscount(form, out) {
    var price = readNumber(document.getElementById("discOriginal"), { min: 0 });
    var pct = readNumber(document.getElementById("discPercent"), { min: 0, max: 100 });
    if (price === null || pct === null) return;
    var discountAmt = (price * pct) / 100;
    var finalPrice = price - discountAmt;
    out.innerHTML =
      resultRow("Final price", fmtINR(finalPrice), { hero: true }) +
      resultRow("You save", fmtINR(discountAmt)) +
      resultRow("Original price", fmtINR(price));
  }

  // ------------------------------------------------------------- Simple Interest
  function calcSimpleInterest(form, out) {
    var principal = readNumber(document.getElementById("siPrincipal"), { min: 0 });
    var rate = readNumber(document.getElementById("siRate"), { min: 0, max: 100 });
    var timeVal = readNumber(document.getElementById("siTimeValue"), { min: 0 });
    if (principal === null || rate === null || timeVal === null) return;
    var unit = document.getElementById("siTimeUnit").value || "years";
    var years = unit === "years" ? timeVal : timeVal / 12;

    var interest = (principal * rate * years) / 100;
    var total = principal + interest;

    out.innerHTML =
      resultRow("Simple interest", fmtINR(interest), { hero: true }) +
      resultRow("Total amount", fmtINR(total)) +
      resultRow("Principal", fmtINR(principal));
  }

  // ------------------------------------------------------------- Compound Interest
  function calcCompoundInterest(form, out) {
    var principal = readNumber(document.getElementById("ciPrincipal"), { min: 1 });
    var rate = readNumber(document.getElementById("ciRate"), { min: 0, max: 100 });
    var years = readNumber(document.getElementById("ciYears"), { min: 0.0834 });
    if (principal === null || rate === null || years === null) return;
    var freqEl = document.getElementById("ciFrequency");
    var n = parseInt(freqEl.value, 10) || 1;
    var freqLabel = freqEl.options[freqEl.selectedIndex].text;
    var r = rate / 100;

    var amount = principal * Math.pow(1 + r / n, n * years);
    var interest = amount - principal;
    var effective = (Math.pow(1 + r / n, n) - 1) * 100;

    // Year-by-year growth breakdown (whole years, capped at 30 rows).
    var tableHtml = "";
    var wholeYears = Math.floor(years);
    if (wholeYears >= 1) {
      var maxRows = Math.min(wholeYears, 30);
      tableHtml =
        '<table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:.92rem">' +
        '<thead><tr><th style="text-align:left;padding:6px 8px;border-bottom:2px solid rgba(255,255,255,.25)">Year</th>' +
        '<th style="text-align:right;padding:6px 8px;border-bottom:2px solid rgba(255,255,255,.25)">Balance</th></tr></thead><tbody>';
      for (var y = 1; y <= maxRows; y++) {
        var bal = principal * Math.pow(1 + r / n, n * y);
        tableHtml +=
          "<tr><td style=\"padding:5px 8px;border-bottom:1px solid rgba(255,255,255,.12)\">" + y + "</td>" +
          "<td style=\"text-align:right;padding:5px 8px;border-bottom:1px solid rgba(255,255,255,.12)\">" + fmtINR(bal) + "</td></tr>";
      }
      tableHtml += "</tbody></table>";
    }

    out.innerHTML =
      resultRow("Maturity amount", fmtINR(amount), { hero: true }) +
      resultRow("Total interest earned", fmtINR(interest)) +
      resultRow("Principal", fmtINR(principal)) +
      resultRow("Compounding", freqLabel) +
      resultRow("Effective annual growth", fmtNum(effective, 2) + "%") +
      tableHtml;
  }

  // ------------------------------------------------------------- CGPA
  var CGPA_MAX_SEMESTERS = 8;

  function cgpaField(i) {
    return (
      '<div class="field">' +
      '<label for="cgpaSgpa' + i + '">Semester ' + i + ' SGPA</label>' +
      '<input type="number" id="cgpaSgpa' + i + '" placeholder="e.g. 8.2" step="0.01" />' +
      '<span class="field-error" id="err-cgpaSgpa' + i + '" role="alert"></span>' +
      "</div>"
    );
  }

  // The SGPA inputs are generated to match the selected semester count.
  function renderCgpaFields(select) {
    var container = document.getElementById("cgpaSemesterFields");
    if (!container) return;
    var count = Math.min(Math.max(parseInt(select.value, 10) || 1, 1), CGPA_MAX_SEMESTERS);
    var html = "";
    for (var i = 1; i <= count; i++) html += cgpaField(i);
    container.innerHTML = html;
  }

  function calcCGPA(form, out) {
    var select = document.getElementById("cgpaSemesters");
    var count = Math.min(Math.max(parseInt(select ? select.value : "", 10) || 1, 1), CGPA_MAX_SEMESTERS);

    var grades = [];
    for (var i = 1; i <= count; i++) {
      var el = document.getElementById("cgpaSgpa" + i);
      if (!el) continue;
      var sgpa = readNumber(el, { min: 0, max: 10 });
      if (sgpa === null) return;
      grades.push(sgpa);
    }
    if (!grades.length) return;

    var total = grades.reduce(function (a, b) {
      return a + b;
    }, 0);
    var cgpa = total / grades.length;
    var percentage = cgpa * 9.5;

    out.innerHTML =
      resultRow("CGPA", fmtNum(cgpa, 2), { hero: true }) +
      resultRow("Percentage (CGPA × 9.5)", fmtNum(percentage, 2) + "%") +
      resultRow("Semesters included", grades.length + (grades.length === 1 ? " semester" : " semesters")) +
      resultRow("Calculation", fmtNum(total, 2) + " ÷ " + grades.length + " semesters");
  }

  var CALCS = {
    percentage: calcPercentage,
    emi: calcEMI,
    gst: calcGST,
    age: calcAge,
    discount: calcDiscount,
    "simple-interest": calcSimpleInterest,
    "compound-interest": calcCompoundInterest,
    cgpa: calcCGPA,
  };

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.querySelector("form[data-calc]");
    if (!form) return;
    var calcType = form.getAttribute("data-calc");
    var out = document.getElementById("resultBody");
    var placeholderHTML = out ? out.innerHTML : "";

    // Wire up any toggle-row groups on the page (tenure unit, add/remove, etc.)
    document.querySelectorAll(".toggle-row[data-target]").forEach(function (group) {
      var hidden = document.getElementById(group.getAttribute("data-target"));
      if (hidden) toggleGroup(group, hidden);
    });

    var gstRateSelect = document.getElementById("gstRate");
    if (gstRateSelect) {
      var customField = document.getElementById("gstRateCustomField");
      gstRateSelect.addEventListener("change", function () {
        if (customField) {
          customField.style.display = gstRateSelect.value === "custom" ? "block" : "none";
        }
      });
    }

    var cgpaSelect = document.getElementById("cgpaSemesters");
    if (cgpaSelect) {
      renderCgpaFields(cgpaSelect);
      cgpaSelect.addEventListener("change", function () {
        renderCgpaFields(cgpaSelect);
      });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var fn = CALCS[calcType];
      if (fn) fn(form, out);
    });

    form.addEventListener("reset", function () {
      window.setTimeout(function () {
        if (out) out.innerHTML = placeholderHTML;
        if (cgpaSelect) renderCgpaFields(cgpaSelect);
        form.querySelectorAll(".field").forEach(function (f) {
          f.classList.remove("has-error");
        });
        form.querySelectorAll(".field-error").forEach(function (e) {
          e.textContent = "";
        });
        form.querySelectorAll(".toggle-row button").forEach(function (b, i) {
          b.classList.toggle("is-active", i === 0);
        });
        var firstHiddenInputs = form.querySelectorAll('input[type="hidden"]');
        firstHiddenInputs.forEach(function (h) {
          var group = document.querySelector('.toggle-row[data-target="' + h.id + '"]');
          if (group) {
            var firstBtn = group.querySelector("button[data-value]");
            if (firstBtn) h.value = firstBtn.getAttribute("data-value");
          }
        });
        var customField = document.getElementById("gstRateCustomField");
        if (customField) customField.style.display = "none";
      }, 0);
    });
  });
})();
