#!/usr/bin/env node
// INSERT CATEGORY ARTICLES - 5 category-wise "Official Services" articles built
// from the 5 CSVs in dist/assets, inserted as Supabase drafts.
// Usage: node build/scripts/insert-category-articles.js [--limit=N] [--only=key] [--dry-run]
// Requires: SUPABASE_SERVICE_ROLE_KEY (from .env or env).
"use strict";
const fs = require("fs");
const path = require("path");
try { require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env"), quiet: true }); } catch (e) {}
const https = require("https");

const SUPABASE_URL = "https://clxwcivvxyyodahexjao.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const CSV_DIR = path.join(__dirname, "..", "..", "dist", "assets");
const SOURCE_DATE = "2026-10-02";

const ARGS = process.argv.slice(2);
const DRY_RUN = ARGS.indexOf("--dry-run") !== -1;
function argValue(name) {
  for (var i = 0; i < ARGS.length; i++) if (ARGS[i].indexOf("--" + name + "=") === 0) return ARGS[i].slice(name.length + 3);
  return "";
}
const ONLY = argValue("only");
const LIMIT = parseInt(argValue("limit"), 10) || 0;

// ---------------------------------------------------------------- CSV parser
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.filter((r) => r.some((v) => v.trim())).map((r) => {
    const o = {};
    header.forEach((h, i) => { o[h.trim()] = (r[i] || "").trim(); });
    return o;
  });
}

// ------------------------------------------------------------------ ARTICLE CONFIGS
const ARTICLES = [
  { key: "business", csv: "business_services.csv",
    title: "8 Official Business Services and Portals in India for Entrepreneurs [2026 Guide]",
    primary_category: "Business", source_name: "National Portal of India",
    source_url: "https://www.india.gov.in",
    label: "Business", plural: "Business", slug: "8-official-business-services-portals-india" },
  { key: "documents", csv: "documents_services.csv",
    title: "5 Official Document Services and Portals in India [2026 Guide]",
    primary_category: "Documents", source_name: "National Portal of India",
    source_url: "https://www.india.gov.in",
    label: "Document", plural: "Documents", slug: "5-official-document-services-portals-india" },
  { key: "education", csv: "education_services.csv",
    title: "8 Official Education Services and Portals in India [2026 Guide]",
    primary_category: "Education", source_name: "Ministry of Education",
    source_url: "https://www.education.gov.in",
    label: "Education", plural: "Education", slug: "8-official-education-services-portals-india" },
  { key: "government", csv: "government_services.csv",
    title: "16 Official Government Services and Portals in India [2026 Guide]",
    primary_category: "Government", source_name: "National Portal of India",
    source_url: "https://www.india.gov.in",
    label: "Government", plural: "Government", slug: "16-official-government-services-portals-india" },
  { key: "money", csv: "money_services.csv",
    title: "8 Official Money and Finance Services and Portals in India [2026 Guide]",
    primary_category: "Money", source_name: "Income Tax Department / EPFO",
    source_url: "https://www.incometax.gov.in/iec/foportal/",
    label: "Money", plural: "Money and Finance", slug: "8-official-money-services-portals-india" },
];

// ------------------------------------------------- SERVICE DESCRIPTIONS (2-3 lines each)
const DESCRIPTIONS = {
  // ---- BUSINESS (8)
  "GST registration and returns": "Businesses above the GST threshold must register on the GST Portal. The portal handles registration applications, monthly or quarterly returns, tax payments and refund claims. Small businesses can also use it to check GST status and download certificates.",
  "MCA company services": "The MCA21 portal is where companies and LLPs are incorporated and where annual filings, director changes and DIN updates are submitted. Entrepreneurs registering a private limited company use it for name approval, SPICe+ forms and compliance certificates.",
  "Udyam registration": "Udyam is the free online MSME registration for micro, small and medium enterprises. Aadhaar and PAN details are validated online, and the certificate is permanent with no renewal needed. Registered MSMEs can access scheme benefits and priority-sector lending.",
  "MSME portal": "MY MSME is the Ministry portal for MSME schemes, notifications and grievance support. Entrepreneurs can check scheme eligibility, download official forms and track MSME-related announcements from the Ministry.",
  "Startup recognition": "The Startup India portal provides DPIIT recognition for eligible startups, plus information on tax benefits and funding schemes. Recognition gives a startup a certificate used for government tenders and scheme applications.",
  "Government procurement": "GeM is the government's online marketplace where sellers register to bid on government purchase orders. Sellers complete vendor assessment and brand registration, then list products and services for ministries, departments and PSUs.",
  "Import-export services": "DGFT handles IEC (Importer Exporter Code) registration, trade policy notices and scheme-related authorisations. Exporters and importers use the portal for licence applications, e-scrips and policy clarifications.",
  "State business services": "This National Portal page lists official State and UT business services - shop licences, labour registrations and trade permits - with direct links to each State's own portal. Use it to find the correct State department before applying.",
  // ---- DOCUMENTS (5)
  "Digital documents": "DigiLocker stores issued documents like Aadhaar, PAN, driving licence and marksheets in a government-verified digital wallet. Documents fetched from issuer departments are legally equivalent to physical copies under the IT Act.",
  "Birth and death registration services": "This listing points to each State's birth and death registration system under the Registrar General. Registration is compulsory within 21 days of the event, and certified copies are issued for school, passport and legal use.",
  "Government documents directory": "A curated directory of government documents, policies, Acts and public publications. Citizens can find official PDFs of schemes, guidelines and departmental documents without searching multiple ministry websites.",
  "Government web directory": "The official directory of central ministries, departments, State governments and UT administrations. Every entry links to the department's verified website, helping citizens avoid look-alike or fraudulent sites.",
  "State and UT document services": "Browse document and certificate services State-wise - ration cards, caste certificates, land records and licences. Each entry links to the official State portal so applications go to the right department.",
  // ---- EDUCATION (8)
  "National Scholarship Portal": "NSP is the single window for central and state scholarships - one registration, one set of documents, and status tracking for every application. Students from school to postgraduate level apply here, and disbursal goes straight to the bank account.",
  "Academic Bank of Credits": "The Academic Bank of Credits stores a student's earned credits in a digital account, so credits can transfer between recognised institutions under NEP. Students open an ABC ID through DigiLocker and share it with their college.",
  "SWAYAM courses": "SWAYAM offers free online courses from NPTEL, CEC and NCERT with optional paid certification exams. Courses run in enrolment windows through the year, and completions can count toward academic credit where institutions allow it.",
  "National Career Service": "NCS connects jobseekers with employers, career counsellors and training providers. Registration is free, and the portal also lists government job notices, apprenticeship vacancies and career guidance resources.",
  "Skill India": "Skill India Digital is the platform for PMKVY and other skill courses, with short-term training, certification and apprenticeship pathways. Learners can find courses by sector and location and track their training records.",
  "Apprenticeship portal": "NATS lists apprenticeship opportunities with registered employers across trades and disciplines. Students and graduates apply with their educational details, and selected candidates get practical training with a monthly stipend.",
  "Education and learning directory": "This National Portal section gathers official education links - universities, boards, grants, loans and learning services. It is useful for finding the correct official body before applying for admissions or funding.",
  "State education services": "Browse State and UT education services - admissions, scholarships, board results and school listings - through official State portals. Use it to reach the right State education department for local schemes.",
  // ---- GOVERNMENT (16)
  "Aadhaar services": "MyAadhaar handles Aadhaar updates - address, mobile number and biometric updates - plus e-Aadhaar download and enrolment status. OTP on the registered mobile is used for most online requests.",
  "PAN services": "The Income Tax portal offers PAN-related services alongside tax filing - Aadhaar-PAN linking status, PAN validation and tax profile updates. It is the official channel for most income-tax work.",
  "PAN application and correction": "Protean (formerly NSDL) is the Income Tax Department's authorised PAN service provider for new PAN applications, corrections, reprints and status tracking. Physical PAN cards are dispatched after online verification.",
  "EPF member services": "The Unified Member Portal lets EPF members check passbook balances, raise transfer and withdrawal claims and update KYC. UAN and OTP are required for login, and most claims settle without a physical office visit.",
  "ESIC services": "ESIC provides health and cash benefits to insured employees and their families. The portal supports employer registration, contribution payments, e-Pehchan cards and dispensary information.",
  "Voter ID and electoral services": "The Voters' Service Portal handles new voter registration, corrections, shifting of constituency and e-EPIC downloads. Applications are verified by the Booth Level Officer before the electoral roll is updated.",
  "Ration Card state portals": "The NFSA page lists the official ration-card portal for every State and UT under the National Food Security Act. Citizens apply for new cards, member addition and e-KYC through their own State system.",
  "Ayushman Bharat PM-JAY": "PM-JAY provides cashless secondary and tertiary hospital cover for eligible families. The portal supports eligibility checks, hospital search and the Ayushman card download through the ABHA-linked process.",
  "ABHA Health ID": "ABHA is a free 14-digit health ID that links a person's health records across hospitals and labs. Creating an ABHA takes an Aadhaar or driving-licence verification and lets records be shared with consent.",
  "PMAY Urban": "PMAY-U provides housing assistance for urban beneficiaries through beneficiary-led construction, affordable housing in partnership and interest subsidy on home loans. The portal carries application status and city-wise project data.",
  "PMAY Gramin": "PMAY-G provides financial assistance for rural housing to eligible households identified through SECC data. The portal shows sanction lists, tranche status and beneficiary details by gram panchayat.",
  "Passport services": "Passport Seva is the official channel for fresh passport applications, reissues, appointments and fee payment. Applications are verified at the PSK or POPSK appointment, and police verification follows as required.",
  "Driving licence and vehicle services": "Parivahan's Sarathi and Vahan services cover learner's licences, driving licences, vehicle registration and permits across States. Most services are fully online with RTO appointment slots.",
  "DigiLocker": "DigiLocker issues and stores government-verified digital documents - Aadhaar, PAN, registration certificate and insurance papers. Documents pulled from issuing departments are legally accepted as originals under the IT Act.",
  "UMANG": "UMANG is a single app and portal for participating central and State services - EPFO, gas booking, PAN, DigiLocker and more. One login covers hundreds of services across departments.",
  "State and UT service directory": "This directory lists official State and UT government services with links to each State's own portal. It is the safest starting point when a service is administered by a State rather than a central ministry.",
  // ---- MONEY (8)
  "Income tax e-filing": "The Income Tax portal is used to file ITRs, pay advance tax, check refund status and download Form 26AS and AIS. Aadhaar-PAN linking is mandatory for return filing, and most notices are responded to here.",
  "EPF member services": "EPF members check passbook balances, file PF withdrawal and advance claims, and update KYC through the Unified Member Portal. Claims are settled to the bank account linked with UAN-KYC.",
  "National Pension System": "eNPS is the online entry point for opening an NPS Tier-1 or Tier-2 account and managing contributions. NPS offers tax benefits under Section 80CCD and is portable across employers.",
  "Public provident fund and small savings": "The National Savings Institute publishes information on PPF, NSC, SCSS and other small-savings schemes - rates, rules and post office operating procedures. Use it to confirm current rates before investing.",
  "DBT status": "PFMS tracks Direct Benefit Transfer payments - scholarships, subsidies and social-security benefits - by bank account or application number. Citizens can check whether a government credit has reached their account.",
  "PM-KISAN": "PM-KISAN credits Rs 6,000 a year to eligible farmer families in three instalments. The portal handles e-KYC, status checks, instalment history and new registration with land and Aadhaar details.",
  "State money services": "Browse State and UT finance services - state tax, pension, treasury and benefit portals - through official links. Use it to reach the correct State department for state-level financial services.",
};

// ------------------------------------------------------------- ARTICLE NARRATIVE
const NARRATIVE = {
  business: {
    summary: "Running a business in India means dealing with several official portals - GST, company registration, MSME, startups and procurement. This guide lists all 8 official business services and portals in one place, with links, levels and what each portal is actually for.",
    intro: "Every official business service in India sits on a government-managed portal. Using the right portal matters: registrations done on look-alike sites are wasted effort, and many services are free on the official site. Below is the complete list of 8 official business services and portals for entrepreneurs, from GST to State shop licences.",
    keyPoints: [
      "GST registration, returns and payments are handled only on the GST Portal (gst.gov.in).",
      "Company and LLP incorporation happens through the MCA21 portal on mca.gov.in.",
      "Udyam registration for MSMEs is free and permanent - never pay an agent for it.",
      "DPIIT startup recognition on Startup India unlocks tax benefits and government tenders.",
      "Sellers can register on GeM to bid for government purchase orders.",
      "Importers and exporters need an IEC code from DGFT before shipping goods.",
      "State-level licences (shop act, labour) are found through the National Portal State/UT services page.",
    ],
    dates: [
      "GST returns are due monthly or quarterly - check the due-date calendar on the GST Portal.",
      "MCA annual filings for companies are due within 30 days of the AGM - confirm the current year dates on mca.gov.in.",
      "Startup India recognition is open year-round; scheme-specific windows are announced on the portal.",
    ],
    compare: [
      ["Register for GST", "GST Portal", "Central"],
      ["Incorporate a company or LLP", "MCA21 (mca.gov.in)", "Central"],
      ["Register as an MSME", "Udyam Registration", "Central"],
      ["Get DPIIT startup recognition", "Startup India", "Central"],
      ["Sell to government buyers", "Government e-Marketplace (GeM)", "Central/State"],
      ["Import or export goods", "DGFT", "Central"],
      ["Find State shop or labour licences", "National Portal State/UT Services", "State/UT"],
    ],
    faqs: [
      { q: "Which portal should I use for GST registration?", a: "Use the GST Portal at gst.gov.in. Registration is free; avoid third-party sites that charge for it. Keep PAN, Aadhaar and bank details ready before you start." },
      { q: "Is Udyam registration free?", a: "Yes. Udyam registration on udyamregistration.gov.in is free and permanent. The certificate replaces the older Udyog Aadhaar and needs no renewal." },
      { q: "How do I get DPIIT startup recognition?", a: "Apply on startupindia.gov.in with your incorporation details. Recognition is available to eligible startups and gives a certificate used for tax benefits and government scheme applications." },
      { q: "Can small businesses bid on government tenders?", a: "Yes. Register as a seller on gem.gov.in, complete vendor assessment, and bid on live purchase orders. Many tenders have relaxed eligibility for MSMEs and startups." },
      { q: "Where do I find my State's business licences?", a: "Open the National Portal State/UT services page (india.gov.in/services/state) and select your State. It links to the official State portals for shop licences, labour registrations and trade permits." },
    ],
  },
  documents: {
    summary: "From DigiLocker to birth certificates, official document services in India run through a handful of trusted portals. This guide lists all 5 official document services and portals, what each one does, and where to find State-level certificate services.",
    intro: "Government documents - Aadhaar, PAN, certificates, policies - are issued and stored across official portals. This guide collects the 5 official document services and portals every citizen uses, from DigiLocker's digital wallet to the National Portal directories that help you find the right State office.",
    keyPoints: [
      "DigiLocker stores legally valid digital copies of issued documents.",
      "Birth and death registration is compulsory within 21 days of the event.",
      "The National Portal documents section hosts official policies, Acts and scheme PDFs.",
      "Always verify a ministry website through the official India.gov.in directory.",
      "State document services (ration card, caste certificate) are reached through your State's portal.",
    ],
    dates: [
      "Birth registration: compulsory within 21 days of birth; delayed registration needs a magisterial process.",
      "Death registration: compulsory within 21 days of death as per the Registration of Births and Deaths Act.",
      "DigiLocker documents are updated by issuer departments as they issue them - no fixed deadline applies.",
    ],
    compare: [
      ["Store documents digitally", "DigiLocker", "Central"],
      ["Register a birth or death", "NGSP services listing", "Central/State"],
      ["Find official government documents", "National Portal Documents", "Central"],
      ["Verify an official ministry website", "National Portal Directory", "Central/State"],
      ["Find State certificate services", "National Portal State/UT Services", "State/UT"],
    ],
    faqs: [
      { q: "Is DigiLocker accepted as original documents?", a: "Yes. Documents shared from DigiLocker are treated as legally valid copies under the IT Act, same as the original, for most official purposes." },
      { q: "How do I register a birth in India?", a: "Apply through your State's registration system - linked from services.india.gov.in - or at the municipal registrar. Registration within 21 days is free; later registration needs an affidavit process." },
      { q: "Where can I find official government policies and PDFs?", a: "Use the National Portal documents directory at india.gov.in/my-government/documents. It links to official ministry documents without third-party sites." },
      { q: "How do I find my State's certificate services?", a: "Open india.gov.in/services/state and select your State or UT. It links to official portals for ration cards, caste certificates, land records and more." },
      { q: "How do I check whether a website is a real government site?", a: "Check it against the official directory at india.gov.in/directory. Real government sites use .gov.in or .nic.in domains; look-alike sites often use similar names with different endings." },
    ],
  },
  education: {
    summary: "Scholarships, online courses, skill training and careers - official education services in India run through dedicated portals. This guide lists all 8 official education services and portals, from the National Scholarship Portal to State education services, with links and levels.",
    intro: "Education in India is delivered through central and State portals - for scholarships, academic records, courses, careers and skills. This guide collects the 8 official education services and portals students and parents actually use, so applications always go to the right official website.",
    keyPoints: [
      "The National Scholarship Portal (scholarships.gov.in) is the single window for central and State scholarships.",
      "SWAYAM offers free online courses with optional paid certification.",
      "The Academic Bank of Credits (ABC) stores transferable academic credits under NEP.",
      "National Career Service connects jobseekers with employers and career counsellors.",
      "Skill India Digital hosts PMKVY skill courses with certification pathways.",
      "NATS lists apprenticeship opportunities with registered employers.",
      "State education services (admissions, board results) are reached through your State's portal.",
    ],
    dates: [
      "NSP scholarship deadlines are set by institutes and departments each year - check the NSP homepage for the current cycle.",
      "SWAYAM courses run in enrolment windows; certification exams happen after course completion.",
      "NATS apprenticeship enrolments follow employer vacancy announcements through the year.",
    ],
    compare: [
      ["Apply for a scholarship", "National Scholarship Portal", "Central/State"],
      ["Store academic credits", "ABC (abc.digilocker.gov.in)", "Central"],
      ["Take a free online course", "SWAYAM", "Central"],
      ["Find jobs and career guidance", "National Career Service", "Central"],
      ["Learn a skill", "Skill India Digital", "Central"],
      ["Find apprenticeships", "NATS", "Central"],
      ["Find State education services", "National Portal State/UT Services", "State/UT"],
    ],
    faqs: [
      { q: "How do I apply for a government scholarship?", a: "Register on scholarships.gov.in, complete one application, upload documents and submit before your institute's verification deadline. One registration covers most central scholarships." },
      { q: "Are SWAYAM courses free?", a: "Yes, the course content is free. Certification exams carry a fee, and passing earns a certificate that some institutions accept for academic credit." },
      { q: "What is the Academic Bank of Credits?", a: "ABC is a digital store of your earned credits that lets you transfer credits between recognised institutions under the National Education Policy. It is accessed through DigiLocker." },
      { q: "How do I find apprenticeship opportunities?", a: "Register on nats.education.gov.in with your educational details. NATS lists vacancies from registered employers across trades, and selected candidates get training with a monthly stipend." },
      { q: "Where are State scholarships and admissions handled?", a: "Through your State's official education portal, linked from india.gov.in/services/state. Central scholarships stay on NSP; State schemes usually have their own portals." },
    ],
  },
  government: {
    summary: "Aadhaar, PAN, EPF, voter ID, ration card, health, housing, passport and transport - government services in India run through official portals. This guide lists all 16 official government services and portals in one place, with links, levels and what each portal does.",
    intro: "Most government services an Indian citizen uses - identity, social security, elections, food, health, housing, travel and documents - are delivered through dedicated official portals. This guide lists all 16 official government services and portals, so you always reach the real website instead of a look-alike.",
    keyPoints: [
      "Aadhaar updates and e-Aadhaar downloads happen on UIDAI's MyAadhaar portal.",
      "PAN services - linking, validation and tax work - are on the Income Tax portal and the authorised Protean PAN portal.",
      "EPF members check balances and file claims on the EPFO Unified Member Portal.",
      "Voter services - registration, corrections, e-EPIC - are on the ECI Voters' Service Portal.",
      "Ration card services are State-specific; NFSA lists the official portal for every State and UT.",
      "PM-JAY health cover and ABHA health IDs run on pmjay.gov.in and abha.abdm.gov.in.",
      "PMAY Urban and PMAY-G handle urban and rural housing assistance respectively.",
      "Passport and driving licence services run on Passport Seva and Parivahan.",
      "DigiLocker and UMANG give single-point access to documents and many services.",
    ],
    dates: [
      "Aadhaar demographic updates can be done online any time; biometric updates follow UIDAI's schedule.",
      "Voter roll revisions happen in special drives announced by the Election Commission through the year.",
      "PMAY-G and PMAY-U instalments follow the sanction and completion milestones shown on their portals.",
    ],
    compare: [
      ["Update Aadhaar or download e-Aadhaar", "MyAadhaar", "Central"],
      ["Link PAN and Aadhaar, file taxes", "Income Tax portal", "Central"],
      ["Apply for or correct a PAN card", "Protean PAN Services", "Central"],
      ["Check PF balance or file claims", "EPFO Unified Member Portal", "Central"],
      ["Register as a voter or get e-EPIC", "ECI Voters' Service Portal", "Central"],
      ["Find your State ration card portal", "NFSA State/UT portals", "Central/State"],
      ["Check PM-JAY eligibility or hospitals", "pmjay.gov.in", "Central"],
      ["Create an ABHA health ID", "abha.abdm.gov.in", "Central"],
      ["Apply for a passport", "Passport Seva", "Central"],
      ["Get a driving licence or register a vehicle", "Parivahan", "Central/State"],
      ["Store and share documents", "DigiLocker", "Central"],
      ["Use many services in one app", "UMANG", "Central/State"],
      ["Find State and UT services", "National Portal State/UT Services", "State/UT"],
    ],
    faqs: [
      { q: "Which portal do I use for Aadhaar updates?", a: "MyAadhaar at myaadhaar.uidai.gov.in. Most updates need an OTP to your registered mobile; biometric updates can be done at an Aadhaar centre." },
      { q: "How do I check my PF balance?", a: "Log in to the EPFO Unified Member Portal with your UAN and OTP. The passbook shows contributions, and claims can be filed from the same portal." },
      { q: "How do I find my State's ration card portal?", a: "Open nfsa.gov.in/portal/ration_card_state_portals_aa - the NFSA page lists the official ration-card portal for every State and UT." },
      { q: "What is ABHA and do I need it?", a: "ABHA is a free 14-digit health ID that links your health records across hospitals and labs with your consent. It is optional but useful for cashless treatment under schemes like PM-JAY." },
      { q: "Where do I apply for a passport or driving licence?", a: "Passport applications go through Passport Seva (portal.passportindia.gov.in) and licence or vehicle services through Parivahan (parivahan.gov.in). Both are fully online with appointment slots." },
    ],
  },
  money: {
    summary: "Income tax, PAN, EPF, pension, small savings, DBT and PM-KISAN - money and finance services in India run through official portals. This guide lists all 8 official money and finance services and portals, with links, levels and what each one is for.",
    intro: "Financial services from the government - tax filing, retirement savings, benefit transfers and farmer support - each have an official portal. This guide lists the 8 official money and finance services and portals, so tax returns, PF claims and benefit checks always happen on the real website.",
    keyPoints: [
      "Income tax returns are filed on the Income Tax portal (incometax.gov.in).",
      "PAN applications and corrections go through the authorised Protean PAN portal.",
      "EPF members check balances and file claims on the EPFO Unified Member Portal.",
      "NPS accounts are opened and managed on eNPS (enps.nsdl.com).",
      "Small-savings scheme rates and rules are published by the National Savings Institute.",
      "PFMS tracks Direct Benefit Transfer payments by bank account or application number.",
      "PM-KISAN handles farmer income-support services including e-KYC and instalment status.",
      "State finance services (tax, pension, treasury) are reached through your State's portal.",
    ],
    dates: [
      "Income tax return filing deadline is usually 31 July for non-audit taxpayers - confirm the current year's date on the Income Tax portal.",
      "Advance tax instalments fall due in June, September, December and March as per the Income Tax calendar.",
      "PM-KISAN instalments are credited in instalment windows notified by the Ministry of Agriculture.",
    ],
    compare: [
      ["File income tax returns", "Income Tax e-Filing", "Central"],
      ["Apply for or correct PAN", "Protean PAN Services", "Central"],
      ["Check PF balance or file claims", "EPFO Unified Member Portal", "Central"],
      ["Open an NPS account", "eNPS", "Central"],
      ["Check small savings rates", "National Savings Institute", "Central"],
      ["Track a benefit or scholarship payment", "PFMS", "Central"],
      ["Use PM-KISAN services", "pmkisan.gov.in", "Central"],
      ["Find State finance services", "National Portal State/UT Services", "State/UT"],
    ],
    faqs: [
      { q: "Which portal do I use to file my income tax return?", a: "The Income Tax portal at incometax.gov.in. Register with PAN and Aadhaar, then file ITR, pay tax and track refunds from the same account." },
      { q: "How do I apply for a PAN card?", a: "Apply through the Protean PAN portal (tinpan.proteantech.in), the Income Tax Department's authorised provider. Applications, corrections and reprints are all handled there." },
      { q: "How do I check if a DBT payment reached my account?", a: "Use PFMS at pfms.nic.in. Enter your bank account or application number to see whether a government credit - scholarship, subsidy or benefit - has been transferred." },
      { q: "What is the difference between PPF and NPS?", a: "PPF is a small-savings scheme with fixed annual contribution limits and a long lock-in, managed through post offices and banks. NPS is a pension account managed by PFRDA with market-linked funds, opened on eNPS." },
      { q: "How do I complete PM-KISAN e-KYC?", a: "Log in at pmkisan.gov.in and complete OTP-based or biometric e-KYC. Instalments stop if e-KYC is pending, so complete it as soon as possible after registration." },
    ],
  },
};

// Portal-aware description keys (service_name repeats across CSVs with different portals).
DESCRIPTIONS["PAN services|Income Tax e-Filing"] = "The Income Tax portal offers PAN-related services alongside tax filing - Aadhaar-PAN linking status, PAN validation and tax profile updates. It is the official channel for most income-tax work.";
DESCRIPTIONS["PAN services|Protean PAN Services"] = "Protean (formerly NSDL) is the Income Tax Department's authorised PAN service provider for new PAN applications, corrections, reprints and status tracking. Physical PAN cards are dispatched after online verification.";

// ------------------------------------------------------------ MARKDOWN BUILDER
function buildRawContent(cfg, rows) {
  const nar = NARRATIVE[cfg.key];
  const n = rows.length;
  const L = [];
  L.push("## Quick Summary");
  L.push(nar.summary);
  L.push("");
  L.push("## What Are the Official " + cfg.plural + " Services in India?");
  L.push(nar.intro);
  L.push("");
  L.push("## Detailed List of " + n + " Official " + cfg.plural + " Portals");
  rows.forEach((s, i) => {
    L.push("");
    L.push("### " + (i + 1) + ". " + s.service_name + " - " + s.level);
    L.push("- **Official Portal:** [" + s.official_portal_name + "](" + s.official_url + ")");
    L.push("- **Category:** " + s.sub_category + " | **Source:** " + s.source_directory);
    L.push("");
    L.push(DESCRIPTIONS[s.service_name + "|" + s.official_portal_name] || DESCRIPTIONS[s.service_name] ||
      (s.purpose + ". Available on the official " + s.official_portal_name + " portal."));
  });
  L.push("");
  L.push("## Comparison Table");
  L.push("| If You Want To... | Go To This Portal | Level |");
  L.push("| --- | --- | --- |");
  nar.compare.forEach((r) => L.push("| " + r[0] + " | " + r[1] + " | " + r[2] + " |"));
  L.push("");
  L.push("## Key Points");
  nar.keyPoints.forEach((k) => L.push("- " + k));
  L.push("");
  L.push("## Important Dates");
  nar.dates.forEach((d) => L.push("- " + d));
  L.push("");
  L.push("## FAQs");
  nar.faqs.forEach((f) => { L.push("### " + f.q); L.push(f.a); L.push(""); });
  L.push("## Official Sources");
  const seen = {};
  rows.forEach((s) => {
    if (seen[s.official_url]) return;
    seen[s.official_url] = true;
    L.push("- [" + s.official_portal_name + "](" + s.official_url + ")");
  });
  L.push("- [National Portal of India](https://www.india.gov.in)");
  L.push("");
  L.push("## Disclaimer");
  L.push("Samjho is an independent informational resource and is not a government website. Content is for general understanding only. Portal URLs, fees and eligibility rules can change - always verify current details on the official portals linked above before applying or acting.");
  return L.join("\n");
}

// ---------------------------------------------------------- SUPABASE INSERT
function rest(method, p, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url = new URL(SUPABASE_URL + p);
    const opts = { hostname: url.hostname, port: 443, path: url.pathname + url.search, method: method,
      headers: { "Content-Type": "application/json", apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY,
        Prefer: method === "POST" ? "return=representation" : "" } };
    if (data) opts.headers["Content-Length"] = Buffer.byteLength(data);
    const req = https.request(opts, (res) => {
      let b = "";
      res.on("data", (c) => (b += c));
      res.on("end", () => {
        try { const parsed = JSON.parse(b || "null");
          if (res.statusCode >= 400) return reject(new Error("HTTP " + res.statusCode + ": " + b.substring(0, 400)));
          resolve(parsed);
        } catch (e) { reject(new Error("Invalid JSON: " + b.substring(0, 200))); }
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function insertOne(cfg) {
  const csvPath = path.join(CSV_DIR, cfg.csv);
  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  console.log("[" + cfg.key + "] " + rows.length + " services from " + cfg.csv);
  const raw = buildRawContent(cfg, rows);
  if (DRY_RUN) { console.log("--- MARKDOWN (" + raw.length + " chars) ---\n" + raw.substring(0, 1500) + "..."); return; }
  const existing = await rest("GET", "/rest/v1/content_items?select=id,title&title=eq." + encodeURIComponent(cfg.title));
  if (existing.length) { console.log("SKIP dedup - already exists (id=" + existing[0].id + ")"); return; }
  const payload = { title: cfg.title, primary_category: cfg.primary_category, raw_content: raw,
    source_name: cfg.source_name, source_url: cfg.source_url, source_published_date: SOURCE_DATE,
    status: "draft", content_type: "Guide", fetch_status: "success",
    refinement_status: "pending", categorization_status: "categorized" };
  const res = await rest("POST", "/rest/v1/content_items", payload);
  console.log("INSERTED id=" + (res[0] && res[0].id) + " | " + cfg.title + " | " + raw.length + " chars");
}

async function main() {
  if (!SERVICE_KEY) { console.error("FATAL: SUPABASE_SERVICE_ROLE_KEY not set"); process.exit(1); }
  let list = ARTICLES.slice();
  if (ONLY) list = list.filter((a) => a.key === ONLY);
  if (LIMIT > 0) list = list.slice(0, LIMIT);
  console.log("Inserting " + list.length + " article(s)" + (DRY_RUN ? " [DRY RUN]" : "") + "...");
  let inserted = 0;
  for (const cfg of list) {
    try { await insertOne(cfg); inserted++; }
    catch (e) { console.error("FAIL " + cfg.key + ": " + e.message); }
  }
  console.log("Done. Processed " + inserted + "/" + list.length + ".");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
