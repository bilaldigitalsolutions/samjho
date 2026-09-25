// Site-wide configuration. Kept separate from content so it's easy to
// extend later (e.g. per-language nav labels for hi/te/ur).

module.exports = {
  siteName: "Samjho",
  tagline: "Understand it. Calculate it. Decide better.",
  domain: "https://samjhoindia.com", // production domain
  socialImage: "/assets/logo/logo-icon.png", // Default social share image.
  // Site-wide author and publisher info for E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness).
  author: {
    name: "Samjho Content Team",
    url: "https://samjhoindia.com/about/",
    description: "Finance and policy experts with 5+ years of experience helping Indians understand money, documents and government schemes.",
  },
  publisher: {
    name: "Samjho India",
    logo: "/assets/logo/logo-icon.png",
  },
  defaultDescription:
    "Samjho explains everyday Indian money, document and education questions in simple words, with calculators to help you decide.",
  nav: [
    { label: "Government", href: "/government/" },
    { label: "Documents", href: "/documents/" },
    { label: "Business", href: "/business/" },
    { label: "Money", href: "/money/" },
    { label: "Education", href: "/education/" },
  ],
  footerLinks: [
    { label: "About", href: "/about/" },
    { label: "Contact", href: "/contact/" },
    { label: "Privacy Policy", href: "/privacy/" },
    { label: "Terms", href: "/terms/" },
    { label: "Disclaimer", href: "/disclaimer/" },
  ],
  // Popular guides shown in the footer of every page — boosts internal linking
  // and helps crawlers discover high-priority pages from every page on the site.
  footerPopularGuides: [
    { label: "What is GST?", href: "/guides/what-is-gst/" },
    { label: "What is EMI?", href: "/guides/what-is-emi/" },
    { label: "What is a Credit Score?", href: "/guides/what-is-credit-score/" },
    { label: "What is a PAN Card?", href: "/guides/what-is-pan-card/" },
    { label: "What is UAN?", href: "/guides/what-is-uan/" },
    { label: "PM Kisan Yojana", href: "/guides/pm-kisan-yojana/" },
  ],
  categories: [
    {
      slug: "money",
      label: "Money",
      description: "Loans, interest, GST, savings and everyday finance.",
    },
    {
      slug: "documents",
      label: "Documents",
      description: "PAN, UAN and the paperwork Indian life runs on.",
    },
    {
      slug: "education",
      label: "Education",
      description: "Marks, grades and how Indian scoring systems work.",
    },
    {
      slug: "jobs",
      label: "Jobs",
      description: "Salary, provident fund and workplace basics.",
    },
    {
      slug: "technology",
      label: "Technology",
      description: "Plain explanations of digital tools you use daily.",
    },
    {
      slug: "everyday-life",
      label: "Everyday Life",
      description: "Small decisions that are easier with the right numbers.",
    },
  ],
  // Top-level category hubs. Each hub is a compact navigation page for an
  // approved Samjho India category. `groups` are the approved pillar areas
  // (shown as "Coming soon" cards until their detailed pages exist).
  // `content` references existing guides/calculators by slug — only these
  // are linked, so no fake URLs are ever generated.
  hubs: [
    {
      slug: "government",
      label: "Government",
      description:
        "Understand government schemes, scholarships and services in plain English — what they are, who they're for, and how to check eligibility on official sources.",
      intro:
        "Plain-English overviews of government schemes, scholarships and services, with official sources for verification.",
      groups: [
        { title: "Schemes & Benefits", description: "Central and state schemes explained — what they offer, who qualifies, and how to check eligibility." },
        { title: "Scholarships", description: "Scholarship programmes for students — who they're for and how to apply." },
        { title: "Government Services", description: "Everyday government services — what they do and how to use them." },
      ],
      content: [
        { type: "guide", slug: "pm-kisan-yojana" },
      ],
    },
    {
      slug: "documents",
      label: "Documents",
      description:
        "Understand the documents Indian life runs on — what they are, why they're needed, what they contain, and common mistakes to avoid.",
      intro:
        "Document literacy for everyday India — identity, certificates, workplace, academic, banking, tax and digital documents.",
      groups: [
        { title: "Personal Identity & Address Proofs", description: "Aadhaar, PAN, voter ID and address proofs — what they are and when you need them." },
        { title: "Official State Certificates & Community Proofs", description: "Birth, caste, income and domicile certificates — what they contain and why they matter." },
        { title: "Employment & Workplace Documents", description: "UAN, payslips, Form 16 and appointment letters — the paperwork of working life." },
        { title: "Academic & Educational Records", description: "Marksheets, degrees, transfer certificates and academic records." },
        { title: "Banking & Financial KYC Documents", description: "KYC documents for bank accounts, cards and financial services." },
        { title: "Tax & Business Literacy Documents", description: "GST invoices, tax returns and business paperwork explained." },
        { title: "Transport & Vehicle Documents", description: "Driving licence, RC book, insurance and vehicle-related documents." },
        { title: "Digital Document Ecosystem", description: "DigiLocker, digital signatures and the online document ecosystem." },
      ],
      content: [
        { type: "guide", slug: "what-is-pan-card" },
        { type: "guide", slug: "what-is-uan" },
      ],
    },
    {
      slug: "business",
      label: "Business",
      description:
        "Practical guidance for starting and running a business in India — structure, tax, finance, credit and digital tools.",
      intro:
        "Business literacy for founders and small businesses — structure, tax, finance, credit and growth.",
      groups: [
        { title: "Starting a Business & Choice of Structure", description: "Sole proprietorship, partnership, LLP and private limited — how to choose." },
        { title: "Business Tax, GST & Legal Literacy", description: "GST, tax registration, invoicing and legal basics for small businesses." },
        { title: "Business Finance, Banking & Cash Flow", description: "Business bank accounts, payments, cash flow and day-to-day finance." },
        { title: "Business Credit, Loans & Financing Support", description: "Business loans, credit and financing options for growth." },
        { title: "Managing Operations, Costs & Profitability", description: "Pricing, costs, margins and profitability for small businesses." },
        { title: "Digital Business Tools & Growth", description: "Digital tools for selling, managing and growing a business." },
        { title: "Business Calculators & Decision Support Tools", description: "Calculators to help you price, budget and plan." },
      ],
      content: [
        { type: "guide", slug: "what-is-gst" },
        { type: "guide", slug: "udyam-registration" },
        { type: "guide", slug: "fssai-license" },
        { type: "guide", slug: "msme-schemes" },
        { type: "guide", slug: "business-loan" },
        { type: "guide", slug: "trademark" },
        { type: "calculator", slug: "gst" },
      ],
    },
    {
      slug: "money",
      label: "Money",
      description:
        "Everyday money explained — banking, savings, loans, inflation, safety and investment basics, with calculators to help you decide.",
      intro:
        "Money literacy for everyday life — banking, borrowing, inflation, safety and investment basics.",
      groups: [
        { title: "Everyday Banking & Savings", description: "Savings accounts, bank basics and everyday money management." },
        { title: "Loans, Borrowing & EMI Management", description: "EMIs, loans and borrowing — how they work and how to manage them." },
        { title: "Purchasing Power, Inflation & Money Awareness", description: "Inflation, purchasing power and understanding what money is worth." },
        { title: "Personal Risk Protection & Financial Safety", description: "Staying safe from fraud and protecting your money." },
        { title: "Investment & Wealth Creation Basics", description: "Investment basics — compounding, risk and long-term thinking." },
        { title: "Money Calculators & Decision Tools", description: "Calculators for EMIs, interest, GST and everyday money decisions." },
      ],
      content: [
        { type: "guide", slug: "what-is-gst" },
        { type: "guide", slug: "what-is-emi" },
        { type: "guide", slug: "what-is-credit-score" },
        { type: "guide", slug: "what-is-inflation" },
        { type: "guide", slug: "what-is-compound-interest" },
        { type: "guide", slug: "what-is-credit-card" },
        { type: "guide", slug: "what-is-savings-account" },
        { type: "calculator", slug: "emi" },
        { type: "calculator", slug: "gst" },
        { type: "calculator", slug: "simple-interest" },
      ],
    },
    {
      slug: "education",
      label: "Education",
      description:
        "Understand academic scoring, education pathways, entrance exams and funding — with tools to help you decide.",
      intro:
        "Education literacy for students and parents — scoring, pathways, exams, funding and career preparation.",
      groups: [
        { title: "Academic Scoring, Grades & Evaluation Systems", description: "CGPA, percentages and how Indian scoring systems work." },
        { title: "Higher Education Pathways & Stream Selection", description: "Choosing streams, courses and higher education paths." },
        { title: "Major Entrance Exams & Qualification Awareness", description: "Entrance exams explained — what they are and how they work." },
        { title: "Funding Your Education", description: "Education loans, scholarships and funding options." },
        { title: "Skills, Employability & Career Preparation", description: "Skills, careers and preparing for the job market." },
        { title: "Academic & Education Decision Tools", description: "Calculators for marks, percentages and academic decisions." },
      ],
      content: [
        { type: "guide", slug: "what-is-cgpa" },
        { type: "calculator", slug: "age" },
      ],
    },
  ],
  // AdSense placeholders — no real ad code is loaded until these are filled in.
  adsense: {
    publisherId: "", // e.g. "ca-pub-0000000000000000"
    slots: {
      headerBanner: "",
      inContent: "",
      sidebar: "",
      footer: "",
    },
  },
  // Google Programmable Search Engine configuration.
  // To enable Google Search:
  // 1. Go to https://programmablesearchengine.google.com/
  // 2. Create a new search engine
  // 3. Copy the Search Engine ID (looks like: 012345678901234567890:abcdefghijk)
  // 4. Paste it below as googleSearch.engineId
  // Note: No API key is required for basic Custom Search usage.
  // If you need API access (100 queries/day free tier), add googleSearch.apiKey
  googleSearch: {
    enabled: true, // Set to false to disable Google search mode
    engineId: "", // e.g. "012345678901234567890:abcdefghijk" — set from Google CSE
    apiKey: "", // Optional: only needed for API access beyond basic Custom Search
  },
  // IndexNow — instant URL submission for Bing, Yandex and Naver.
  // `key` is a 32-character hex string, also stored as
  // build/assets/indexnow/<key>.txt. build.js copies that file to the site root
  // (dist/<key>.txt) because IndexNow verifies ownership by fetching
  // https://<domain>/<key>.txt before accepting submissions.
  // After deploying dist/, run `node scripts/ping-indexnow.js` from build/ to
  // submit every URL in dist/sitemap.xml.
  // To rotate the key: save build/assets/indexnow/<new-key>.txt (content = the
  // new key), update `key` below, then rebuild and redeploy.
  indexNow: {
    enabled: true,
    key: "6cb3ddb995af7c9d98ef41ae18d3ae7e",
  },
  // Firebase project config (used by auth.js and layout.js auth bootstrap).
  firebase: {
    apiKey: "AIzaSyDN3R59ZC4t4QY-On8o_Th3PX0SCavbWVo",
    authDomain: "samjho-96e3a.firebaseapp.com",
    projectId: "samjho-96e3a",
    storageBucket: "samjho-96e3a.firebasestorage.app",
    messagingSenderId: "340787658856",
    appId: "1:340787658856:web:ea642ea082ca7547043bdd",
    measurementId: "G-T0756717X6",
  },
};
