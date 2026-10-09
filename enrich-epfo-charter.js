const { fs, guides, FILE, update } = require('./enrich-helper');

// Enrich epfo-citizens-charter
update('epfo-citizens-charter', {
  content: `## What Happened

The Employees' Provident Fund Organisation (EPFO) has published its official Citizen's Charter, a comprehensive document that outlines the organization's commitment to service delivery standards, timelines, and grievance redressal mechanisms for subscribers and employers.

The Citizen's Charter serves as a public accountability framework, detailing the specific services EPFO provides, the maximum timeframes for service delivery, and the quality standards subscribers can expect when interacting with EPFO offices.

## Key Services Covered in the Charter

The EPFO Citizen's Charter covers the following critical service areas:

**For Subscribers:**
- Universal Account Number (UAN) generation and activation
- KYC seeding and updation (Aadhaar, PAN, Bank details)
- Online claim settlement (Form 19, 10C, 31)
- PF transfer requests between employers
- Pension Payment Order (PPO) generation for EPS retirees
- Life Certificate submission and pension continuation

**For Employers:**
- New establishment registration and code allotment
- Monthly ECR (Electronic Challan cum Return) processing
- Digital signature certificate registration
- Exemption applications for PF Trust formation

## Service Delivery Timelines

The Charter specifies maximum processing times for each service:

- UAN Generation: Within 48 hours of KYC approval
- Online Claim Settlement: Within 20 working days
- PF Transfer Requests: Within 20 working days
- Grievance Redressal (EPFiGMS): Initial response within 7 days, resolution within 30 days
- Joint Declaration (Name/Date corrections): Within 30 working days

## Grievance Redressal Mechanism

The Charter establishes a three-tier grievance redressal structure:

1. **First Level**: Regional PF Commissioner at the concerned Regional Office
2. **Second Level**: Additional Central PF Commissioner at Zonal Office
3. **Third Level**: Central PF Commissioner at EPFO Headquarters

Subscribers can file grievances online through EPFiGMS (epfigms.gov.in), CPGRAMS (pgportal.gov.in), or by visiting the concerned EPFO office in person.

## Why It Matters

The Citizen's Charter empowers subscribers by providing transparent service standards and accountability mechanisms. It ensures that EPFO services are delivered within defined timelines and provides clear escalation paths when service delivery falls short of commitments.

For employers, the Charter clarifies compliance requirements and reduces uncertainty around registration, challan processing, and statutory obligations.

## Key Points

- EPFO's Citizen's Charter defines service standards, timelines, and grievance mechanisms
- Online claims must be settled within 20 working days as per Charter commitments
- Three-tier grievance redressal: Regional → Zonal → Headquarters level
- UAN generation guaranteed within 48 hours of successful KYC verification
- Charter applies uniformly across all 138+ EPFO Regional Offices nationwide`,
  faqs: [
    {
      q: 'What is the EPFO Citizen\'s Charter?',
      a: 'The EPFO Citizen\'s Charter is an official document that outlines service delivery standards, processing timelines, and grievance redressal mechanisms for all EPFO services provided to subscribers and employers.'
    },
    {
      q: 'Within how many days must EPFO settle online PF claims?',
      a: 'According to the Citizen\'s Charter, EPFO must settle online PF withdrawal claims (Form 19, 10C, 31) within 20 working days from the date of application submission.'
    },
    {
      q: 'How long does EPFO take to generate a Universal Account Number (UAN)?',
      a: 'EPFO commits to generating UAN within 48 hours after successful KYC verification and approval by the employer.'
    },
    {
      q: 'What is the grievance escalation structure defined in the Charter?',
      a: 'The Charter establishes a three-tier structure: First Level (Regional PF Commissioner), Second Level (Additional Central PF Commissioner at Zonal Office), and Third Level (Central PF Commissioner at Headquarters).'
    },
    {
      q: 'Where can I file a grievance if EPFO delays my claim beyond 20 days?',
      a: 'You can file grievances online through EPFiGMS (epfigms.gov.in), CPGRAMS (pgportal.gov.in), or visit the concerned Regional PF Commissioner\'s office in person.'
    },
    {
      q: 'Does the Citizen\'s Charter apply to exempted PF trusts?',
      a: 'No, the Citizen\'s Charter applies only to EPFO-managed establishments. Exempted trusts operate under their own trust deeds but must comply with EPF Act provisions.'
    }
  ]
});

fs.writeFileSync(FILE, JSON.stringify(guides, null, 2), 'utf8');
console.log('Enriched epfo-citizens-charter with 500+ words and 6 FAQs');
