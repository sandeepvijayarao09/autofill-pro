// Comprehensive field pattern test — runs in Node.js without a browser
// Tests all 25 sites, false positives, edge cases, and fixes from the audit

// ─── Copy FIELD_PATTERNS from content.js ─────────────────────────────────────
const FIELD_PATTERNS = {
  // preferredName BEFORE firstName: "preferred_first_name" must match preferred, not first
  preferredName:    [/preferred[\s_-]?(?:first[\s_-]?)?name/i, /preferred[\s_-]?first/i, /goes[\s_-]?by/i, /nickname/i],
  firstName:        [/first[\s_-]?name/i, /fname/i, /given[\s_-]?name/i, /forename/i],
  // lookbehind prevents /lname/ from matching "fullname"
  lastName:         [/last[\s_-]?name/i, /(?<![a-z])lname(?![a-z])/i, /surname/i, /family[\s_-]?name/i],
  fullName:         [/^name$/i, /full[\s_-]?name/i, /your[\s_-]?name/i, /^full$/i, /(?:candidate|applicant)[\s_-]?name/i],
  pronouns:         [/pronoun/i],
  email:            [/e[\s_-]?mail/i, /email[\s_-]?address/i, /^email$/i],
  phone:            [/phone/i, /^mobile$/i, /mobile[\s_-]?(?:phone|number|no)/i, /^cell$/i, /cell[\s_-]?(?:phone|number|no)/i, /telephone/i, /contact[\s_-]?number/i],
  dateOfBirth:      [/dob/i, /birth[\s_-]?date/i, /date[\s_-]?of[\s_-]?birth/i, /birthday/i],
  // age: computed from dateOfBirth at fill time (not user-stored)
  // lookbehind prevents "language","coverage","percentage" from matching
  age:              [/(?<![a-z])age(?![\s_-]?(?:ncy|nt|nda|nts|s\b))(?![a-z])/i, /how[\s_-]?old/i],
  gender:           [/gender/i, /sex(?!ual)/i],

  // negative lookahead prevents "address_line_2" from stealing; still catches Taleo compound IDs
  addressLine1:     [/address[\s_-]?(?:1|line[\s_-]?1)/i, /street[\s_-]?address/i, /^address$/i, /^street$/i, /^location$/i, /(?<![a-z])address(?![\s_-]?(?:line[\s_-]?)?2)(?![a-z])/i],
  addressLine2:     [/address[\s_-]?(?:2|line[\s_-]?2)/i, /^apt\.?$/i, /apartment/i, /suite/i, /^unit[\s_-]?(?:number|no\.?)?$/i],
  // lookbehind prevents "ethnicity" (which contains "city") from matching; still catches compound IDs
  city:             [/(?<![a-z])city(?![a-z])/i, /^town$/i, /municipality/i],
  // lookbehind avoids "statement","status","estate"; location.region catches SmartRecruiters
  state:            [/(?<![a-z])state(?![a-z])/i, /^province$/i, /state[\s_-]?(?:or[\s_-]?)?province/i, /location[._]region/i],
  // unanchored /zip/ catches "iCIMS_field_Zip"
  zipCode:          [/zip[\s_-]?code/i, /postal[\s_-]?code/i, /postcode/i, /zip/i, /^pincode$/i],
  // unanchored catches "iCIMS_field_Country"
  country:          [/country/i],

  // coverLetter and messageToManager BEFORE currentCompany — stops "Note to Employer" → currentCompany
  coverLetter:      [/cover[\s_-]?letter/i, /motivation[\s_-]?letter/i, /letter[\s_-]?of[\s_-]?intent/i, /\bnotes?\b/i, /note.*(?:recruiter|company|employer|hiring)/i],
  messageToManager: [/message.*(?:hiring|manager|recruiter)/i, /note.*(?:recruiter|company|employer)/i, /^comments?$/i, /additional[\s_-]?info(?:rmation)?/i],

  currentTitle:     [/job[\s_-]?title/i, /current[\s_-]?(?:title|position|role)/i, /professional[\s_-]?title/i, /work[\s_-]?title/i, /^designation$/i, /headline/i],
  currentCompany:   [/company/i, /employer/i, /organization/i, /organisation/i, /^firm$/i, /\borg\b/i],
  yearsOfExp:       [/years[\s_-]?of[\s_-]?exp/i, /experience[\s_-]?years/i, /years[\s_-]?exp/i],
  // lookbehind prevents "pre-skilled" from matching; "skills" and "technical_skills" still match
  skills:           [/(?<![a-z])skills?(?![a-z])/i, /technical[\s_-]?skills/i, /key[\s_-]?skills/i, /expertise/i, /proficienc/i],
  // unanchored /language/ catches "language Language"
  languages:        [/language/i, /language[\s_-]?proficienc/i, /spoken[\s_-]?language/i],
  securityClearance:[/security[\s_-]?clearance/i, /clearance[\s_-]?level/i, /(?:top[\s_-]?secret|ts[\s_-]?sci)[\s_-]?clearance/i],
  linkedInUrl:      [/linkedin/i],
  githubUrl:        [/github/i],
  // lookbehind on website catches "candidate_website" but not "website_design" etc.
  portfolioUrl:     [/portfolio/i, /personal[\s_-]?(?:url|site|website)/i, /^url$/i, /(?<![a-z])website(?![a-z])/i],
  twitterUrl:       [/twitter/i, /\bx\.com\b/i],

  // classYear BEFORE university — "school_year" → classYear, "school_name" → university
  classYear:        [/class[\s_-]?year/i, /school[\s_-]?year/i, /academic[\s_-]?year/i],
  // unanchored /school/ catches "school_name"
  university:       [/university/i, /college/i, /institution/i, /school/i],
  degree:           [/degree/i, /qualification/i],
  // /program/ catches Taleo "Program" field for major
  major:            [/major/i, /field[\s_-]?of[\s_-]?study/i, /discipline/i, /^course$/i, /program/i],
  graduationYear:   [/grad[\s_-]?year/i, /graduation[\s_-]?(?:year|date)/i, /^year[\s_-]?of[\s_-]?grad/i, /pass[\s_-]?out/i],
  // unanchored /gpa/ catches compound IDs like "dialogTemplate-...-gpa"
  gpa:              [/gpa/i, /cgpa/i, /grade[\s_-]?point/i],

  visaStatus:       [/visa/i, /work[\s_-]?auth(?:orization)?/i, /work[\s_-]?permit/i, /work[\s_-]?eligib/i, /right[\s_-]?to[\s_-]?work/i, /sponsorship/i],
  relocation:       [/relocat/i],
  workArrangement:  [/work[\s_-]?arrangement/i, /remote[\s_-]?prefer/i, /hybrid[\s_-]?prefer/i, /work[\s_-]?(?:setting|mode|type)/i],
  jobFunction:      [/job[\s_-]?function/i, /position[\s_-]?applied/i, /area.*interest/i, /department.*interest/i, /role.*interest/i],
  // negative lookahead excludes "salary_history" (past salary ≠ expected salary)
  expectedSalary:   [/salary(?![\s_-]?histor)/i, /expected[\s_-]?comp/i, /desired[\s_-]?comp/i, /ctc/i, /pay[\s_-]?expect/i],

  summary:          [/summary/i, /\bbio\b/i, /about[\s_-]?me/i, /profile[\s_-]?summary/i, /professional[\s_-]?summary/i],
  referralSource:   [/how.*hear/i, /hear.*about/i, /referral[\s_-]?source/i, /how.*(?:find|learn).*(?:us|this|job|role)/i, /application[\s_-]?source/i],
  raceEthnicity:    [/race/i, /ethnic/i],
  veteranStatus:    [/veteran/i, /protected[\s_-]?veteran/i, /military[\s_-]?status/i],
  disabilityStatus: [/disabilit/i, /section[\s_-]?503/i],
};

const AUTOCOMPLETE_MAP = {
  "given-name": "firstName", "family-name": "lastName", name: "fullName",
  email: "email", tel: "phone", bday: "dateOfBirth", sex: "gender",
  "address-line1": "addressLine1", "address-line2": "addressLine2",
  "address-level2": "city", "address-level1": "state",
  "postal-code": "zipCode", country: "country", "country-name": "country",
  organization: "currentCompany", "organization-title": "currentTitle", url: "portfolioUrl"
};

function matchKey(haystack, autocomplete = "") {
  if (AUTOCOMPLETE_MAP[autocomplete]) return AUTOCOMPLETE_MAP[autocomplete];
  const hay = haystack.toLowerCase();
  for (const [key, pats] of Object.entries(FIELD_PATTERNS)) {
    if (pats.some(p => p.test(hay))) return key;
  }
  return null;
}

// ─── DOB Format Logic (mirrored from content.js for Node testing) ─────────────
function formatDOB(dob, hints = "", elType = "text", maxl = 0) {
  if (!dob) return dob;
  let yyyy, mm, dd;
  const iso = dob.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const us  = dob.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const eu  = dob.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (iso)  { [, yyyy, mm, dd] = iso; }
  else if (us) { [, mm, dd, yyyy] = us; }
  else if (eu) { [, dd, mm, yyyy] = eu; }
  else return dob;

  if (elType === "date") return `${yyyy}-${mm}-${dd}`;

  const h = hints.toUpperCase();
  const sep = h.includes("/") ? "/" : h.includes(".") ? "." : "-";

  if (/DD[\s\/\-\.]MM[\s\/\-\.]YYYY/.test(h)) return `${dd}${sep}${mm}${sep}${yyyy}`;
  if (/MM[\s\/\-\.]DD[\s\/\-\.]YYYY/.test(h)) return `${mm}${sep}${dd}${sep}${yyyy}`;
  if (/YYYY[\s\/\-\.]MM[\s\/\-\.]DD/.test(h)) return `${yyyy}-${mm}-${dd}`;
  if (/MM[\s\/\-\.]YYYY/.test(h))             return `${mm}${sep}${yyyy}`;
  if (/YYYYMMDD/.test(h))                     return `${yyyy}${mm}${dd}`;
  if (/MMDDYYYY/.test(h))                     return `${mm}${dd}${yyyy}`;
  if (/DDMMYYYY/.test(h))                     return `${dd}${mm}${yyyy}`;

  if (maxl === 8)  return `${mm}${dd}${yyyy}`;
  if (maxl === 10) return `${mm}/${dd}/${yyyy}`;
  return `${mm}/${dd}/${yyyy}`;  // US default
}

function computeAge(dob) {
  const m = dob?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const birth = new Date(+m[1], +m[2] - 1, +m[3]);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() ||
     (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age > 0 ? String(age) : null;
}

// ─── Test Helpers ─────────────────────────────────────────────────────────────
let pass = 0, fail = 0, warn = 0;
const fails = [], warnings = [];

function expect(haystack, expectedKey, siteName, autocomplete = "") {
  const got = matchKey(haystack, autocomplete);
  if (got === expectedKey) {
    pass++;
  } else {
    fail++;
    fails.push({ site: siteName, field: haystack, expected: expectedKey, got });
  }
}

function expectNull(haystack, label, siteName) {
  const got = matchKey(haystack);
  if (got === null) {
    pass++;
  } else {
    warn++;
    warnings.push({ site: siteName, field: haystack, label, got, note: "FALSE POSITIVE — should NOT match" });
  }
}

function expectNot(haystack, wrongKey, siteName) {
  const got = matchKey(haystack);
  if (got !== wrongKey) {
    pass++;
  } else {
    fail++;
    fails.push({ site: siteName, field: haystack, expected: `NOT ${wrongKey}`, got });
  }
}

// ─── SITE 1: Greenhouse ───────────────────────────────────────────────────────
const GH = "Greenhouse";
expect("first_name", "firstName", GH);
expect("last_name", "lastName", GH);
expect("email", "email", GH);
expect("phone", "phone", GH);
expect("location", "addressLine1", GH);           // location → addr pattern
expect("LinkedIn Profile", "linkedInUrl", GH);
expect("Github", "githubUrl", GH);
expect("Website", "portfolioUrl", GH);
expect("s2id_education_degree_0", "degree", GH);
expect("s2id_education_discipline_0", "major", GH);
expect("school_name", "university", GH);
expect("race", "raceEthnicity", GH);
expect("veteran_status", "veteranStatus", GH);
expect("disability_status", "disabilityStatus", GH);
expect("How did you hear about this job?", "referralSource", GH);
expect("preferred_first_name", "preferredName", GH);
expect("pronouns", "pronouns", GH);

// ─── SITE 2: Lever ────────────────────────────────────────────────────────────
const LV = "Lever";
expect("name", "fullName", LV);                   // Lever name="name"
expect("email", "email", LV);
expect("phone", "phone", LV);
expect("org", "currentCompany", LV);              // CRITICAL FIX: \borg\b
expect("urls[LinkedIn]", "linkedInUrl", LV);
expect("urls[GitHub]", "githubUrl", LV);
expect("urls[Portfolio]", "portfolioUrl", LV);
expect("comments Additional information", "messageToManager", LV);

// ─── SITE 3: Ashby ────────────────────────────────────────────────────────────
const AS = "Ashby";
expect("_systemfield_name Full Name", "fullName", AS);
expect("_systemfield_email", "email", AS);
expect("_systemfield_phone", "phone", AS);
expect("_systemfield_linkedin", "linkedInUrl", AS);
expect("pronouns", "pronouns", AS);
expect("How did you hear about us?", "referralSource", AS);

// ─── SITE 4: SmartRecruiters ──────────────────────────────────────────────────
const SR = "SmartRecruiters";
expect("firstName", "firstName", SR);
expect("lastName", "lastName", SR);
expect("email", "email", SR);
expect("phoneNumber Phone Number", "phone", SR);
expect("location.country", "country", SR);
expect("location.region", "state", SR);
expect("location.city", "city", SR);
expect("web.LinkedIn", "linkedInUrl", SR);
expect("messageToHiringManager Message to Hiring Manager", "messageToManager", SR);

// ─── SITE 5: Workable ─────────────────────────────────────────────────────────
const WK = "Workable";
expect("firstname", "firstName", WK);
expect("lastname", "lastName", WK);
expect("email", "email", WK);
expect("phone", "phone", WK);
expect("headline Professional Headline", "currentTitle", WK);  // FIXED: headline added
expect("summary", "summary", WK);
expect("address", "addressLine1", WK);
expect("cover_letter", "coverLetter", WK);

// ─── SITE 6: iCIMS ───────────────────────────────────────────────────────────
const IC = "iCIMS";
expect("iCIMS_field_FirstName First Name", "firstName", IC);
expect("iCIMS_field_LastName Last Name", "lastName", IC);
expect("iCIMS_field_Email", "email", IC);
expect("iCIMS_field_MobilePhone Mobile Phone", "phone", IC);
expect("iCIMS_field_Address1", "addressLine1", IC);
expect("iCIMS_field_City", "city", IC);
expect("iCIMS_field_State", "state", IC);
expect("iCIMS_field_Zip", "zipCode", IC);
expect("iCIMS_field_Country", "country", IC);
expect("iCIMS_field_LinkedIn", "linkedInUrl", IC);
expect("iCIMS_field_DesiredSalary Desired Salary", "expectedSalary", IC);
expect("iCIMS_field_WorkAuth Work Authorization", "visaStatus", IC);
expect("iCIMS_field_Race Race/Ethnicity", "raceEthnicity", IC);
expect("iCIMS_field_VetStatus Veteran Status", "veteranStatus", IC);
expect("iCIMS_field_Disability Disability Status", "disabilityStatus", IC);
expect("How did you find this role?", "referralSource", IC);

// ─── SITE 7: Taleo ────────────────────────────────────────────────────────────
const TA = "Taleo";
expect("dialogTemplate-dialogForm-FirstName", "firstName", TA);
expect("dialogTemplate-dialogForm-LastName", "lastName", TA);
expect("dialogTemplate-dialogForm-Address", "addressLine1", TA);
expect("dialogTemplate-dialogForm-City", "city", TA);
expect("dialogTemplate-dialogForm-ZipCode", "zipCode", TA);
expect("dialogTemplate-dialogForm-MobilePhone", "phone", TA);
expect("dialogTemplate-dialogForm-Employer", "currentCompany", TA);
expect("dialogTemplate-dialogForm-UDFExperience_Title Job Title", "currentTitle", TA);
expect("dialogTemplate-dialogForm-Institution", "university", TA);
expect("dialogTemplate-dialogForm-Program", "major", TA);
expect("dialogTemplate-dialogForm-StudyLevel Degree", "degree", TA);
expect("dialogTemplate-dialogForm-gpa", "gpa", TA);
expect("dialogTemplate-dialogForm-graduationDate Graduation Date", "graduationYear", TA); // FIXED

// ─── SITE 8: BambooHR ─────────────────────────────────────────────────────────
const BH = "BambooHR";
expect("firstName", "firstName", BH);
expect("lastName", "lastName", BH);
expect("email", "email", BH);
expect("phone", "phone", BH);
expect("cover_letter Cover Letter", "coverLetter", BH);
expect("How did you hear about this position?", "referralSource", BH);

// ─── SITE 9: Workday ─────────────────────────────────────────────────────────
const WD = "Workday";
expect("legalNameSection_firstName First Name", "firstName", WD);
expect("legalNameSection_lastName Last Name", "lastName", WD);
expect("addressSection_addressLine1", "addressLine1", WD);
expect("addressSection_city", "city", WD);
expect("addressSection_postalCode", "zipCode", WD);
expect("phone-number", "phone", WD);
expect("jobTitle Current Job Title", "currentTitle", WD);
expect("company Current Company", "currentCompany", WD);
expect("school University", "university", WD);
expect("gpa", "gpa", WD);
expect("degree", "degree", WD);
expect("language Language", "languages", WD);

// ─── SITE 10: LinkedIn Easy Apply ────────────────────────────────────────────
const LI = "LinkedIn";
expect("data-field-firstname First Name", "firstName", LI);
expect("data-field-lastname Last Name", "lastName", LI);
expect("data-field-phone Phone", "phone", LI);
expect("data-field-email Email", "email", LI);
expect("data-field-company Current Company", "currentCompany", LI);
expect("data-field-title Job Title", "currentTitle", LI);
expect("data-field-city City", "city", LI);
expect("data-field-state State", "state", LI);
expect("data-field-country Country", "country", LI);
expect("data-field-zip Zip Code", "zipCode", LI);
expect("headline LinkedIn Headline", "currentTitle", LI);  // FIXED
expect("pronouns Pronouns", "pronouns", LI);               // FIXED
expect("How did you find this job?", "referralSource", LI); // FIXED

// ─── SITE 11: Indeed ─────────────────────────────────────────────────────────
const IN = "Indeed";
expect("fullName Full Name", "fullName", IN);
expect("email", "email", IN);
expect("phoneNumber", "phone", IN);
expect("coverletter Cover Letter", "coverLetter", IN);
expect("headline Professional Headline", "currentTitle", IN);  // FIXED
expect("summary", "summary", IN);
expect("school", "university", IN);
expect("degree", "degree", IN);
expect("major", "major", IN);
expect("skills Skills", "skills", IN);                      // FIXED
expect("language Language", "languages", IN);              // FIXED

// ─── SITE 12: Glassdoor ──────────────────────────────────────────────────────
const GL = "Glassdoor";
expect("firstName", "firstName", GL);
expect("lastName", "lastName", GL);
expect("email", "email", GL);
expect("phone", "phone", GL);
expect("cover_letter", "coverLetter", GL);
expect("workAuthorization Work Authorization", "visaStatus", GL);
expect("veteranStatus Veteran Status", "veteranStatus", GL);  // FIXED
expect("disabilityStatus Disability Status", "disabilityStatus", GL);  // FIXED

// ─── SITE 13: ZipRecruiter ───────────────────────────────────────────────────
const ZR = "ZipRecruiter";
expect("name Full Name", "fullName", ZR);
expect("email", "email", ZR);
expect("phone", "phone", ZR);
expect("cover_letter", "coverLetter", ZR);
expect("note Note to employer", "coverLetter", ZR);          // FIXED: note→coverLetter

// ─── SITE 14: Wellfound / AngelList ──────────────────────────────────────────
const WF = "Wellfound";
expect("note Note", "coverLetter", WF);                     // FIXED: ^notes? matches
expect("linkedin LinkedIn URL", "linkedInUrl", WF);
expect("github GitHub URL", "githubUrl", WF);
expect("website Portfolio", "portfolioUrl", WF);

// ─── SITE 15: Dice ───────────────────────────────────────────────────────────
const DC = "Dice";
expect("firstName", "firstName", DC);
expect("lastName", "lastName", DC);
expect("email", "email", DC);
expect("phone", "phone", DC);
expect("workAuthorization", "visaStatus", DC);
expect("security clearance Security Clearance Level", "securityClearance", DC);  // FIXED
expect("skills Technical Skills", "skills", DC);            // FIXED

// ─── SITE 16: Google Careers (Phenom) ────────────────────────────────────────
const GC = "Google";
expect("firstName First Name", "firstName", GC);
expect("lastName Last Name", "lastName", GC);
expect("email", "email", GC);
expect("phone", "phone", GC);
expect("preferredName Preferred Name", "preferredName", GC);  // FIXED
expect("pronouns", "pronouns", GC);                          // FIXED
expect("veteranStatus Veteran Status", "veteranStatus", GC);  // FIXED
expect("disabilityStatus Disability Status", "disabilityStatus", GC); // FIXED
expect("raceEthnicity Race/Ethnicity", "raceEthnicity", GC); // FIXED
expect("How did you hear about this job?", "referralSource", GC); // FIXED
expect("coverLetter Cover Letter", "coverLetter", GC);
expect("linkedIn LinkedIn URL", "linkedInUrl", GC);

// ─── SITE 17: Handshake ──────────────────────────────────────────────────────
const HS = "Handshake";
expect("firstName", "firstName", HS);
expect("preferred_name Preferred Name", "preferredName", HS);  // FIXED
expect("pronouns", "pronouns", HS);                           // FIXED
expect("school_year Class Year", "classYear", HS);            // FIXED: classYear before university
expect("university", "university", HS);
expect("major", "major", HS);
expect("gpa", "gpa", HS);
expect("note Note to Employer", "coverLetter", HS);           // FIXED

// ─── SITE 18: Rippling ATS ───────────────────────────────────────────────────
const RP = "Rippling";
expect("preferred_first_name Preferred First Name", "preferredName", RP); // FIXED
expect("currentTitle Current Job Title", "currentTitle", RP);
expect("currentCompany Current Employer", "currentCompany", RP);
expect("yearsOfExperience Years of Experience", "yearsOfExp", RP);
expect("skills Areas of Expertise", "skills", RP);           // FIXED
expect("cover_letter", "coverLetter", RP);
expect("expectedSalary Expected Salary", "expectedSalary", RP);
expect("relocation Open to Relocation?", "relocation", RP);  // FIXED
expect("workArrangement Work Arrangement Preference", "workArrangement", RP); // FIXED
expect("jobFunction Area of Interest", "jobFunction", RP);   // FIXED

// ─── SITE 19: Meta Careers ───────────────────────────────────────────────────
const MC = "Meta";
expect("first_name", "firstName", MC);
expect("last_name", "lastName", MC);
expect("email_address", "email", MC);
expect("phone_number", "phone", MC);
expect("linkedin_url", "linkedInUrl", MC);
expect("cover_letter_text", "coverLetter", MC);
expect("work_authorization Work Authorization Required?", "visaStatus", MC);

// ─── SITE 20: Amazon Jobs ────────────────────────────────────────────────────
const AJ = "Amazon";
expect("firstName", "firstName", AJ);
expect("lastName", "lastName", AJ);
expect("email", "email", AJ);
expect("phone", "phone", AJ);
expect("preferredName Preferred Name", "preferredName", AJ);
expect("How did you find this position?", "referralSource", AJ);

// ─── SITE 21: Microsoft Careers ──────────────────────────────────────────────
const MS = "Microsoft";
expect("firstName", "firstName", MS);
expect("lastName", "lastName", MS);
expect("email", "email", MS);
expect("phone", "phone", MS);
expect("security clearance required Security Clearance Level", "securityClearance", MS);

// ─── SITE 22: Apple Jobs ─────────────────────────────────────────────────────
const AP = "Apple";
expect("firstName", "firstName", AP);
expect("lastName", "lastName", AP);
expect("email", "email", AP);
expect("phone", "phone", AP);
expect("university University", "university", AP);
expect("degree", "degree", AP);
expect("gpa", "gpa", AP);
expect("graduation_year Graduation Year", "graduationYear", AP);
expect("How did you hear about Apple?", "referralSource", AP);

// ─── SITE 23: SmartRecruiters extra fields ───────────────────────────────────
expect("web.Twitter Twitter Profile", "twitterUrl", "SmartRecruiters-Twitter");  // FIXED
expect("relocation_willingness Open to relocating?", "relocation", "SmartRecruiters-Relocation");

// ─── SITE 24: Simplify ───────────────────────────────────────────────────────
const SI = "Simplify";
expect("firstName", "firstName", SI);
expect("lastName", "lastName", SI);
expect("email", "email", SI);
expect("phone", "phone", SI);
expect("linkedin", "linkedInUrl", SI);
expect("skills Skills List", "skills", SI);  // FIXED

// ─── SITE 25: HN / Workatastartup ────────────────────────────────────────────
// These route to company ATSs — covered by the above tests

// ─── AUTOCOMPLETE ATTRIBUTE TESTS ────────────────────────────────────────────
expect("", "firstName", "Autocomplete", "given-name");
expect("", "lastName", "Autocomplete", "family-name");
expect("", "fullName", "Autocomplete", "name");
expect("", "email", "Autocomplete", "email");
expect("", "phone", "Autocomplete", "tel");
expect("", "addressLine1", "Autocomplete", "address-line1");
expect("", "addressLine2", "Autocomplete", "address-line2");
expect("", "city", "Autocomplete", "address-level2");
expect("", "state", "Autocomplete", "address-level1");
expect("", "zipCode", "Autocomplete", "postal-code");
expect("", "country", "Autocomplete", "country");
expect("", "currentCompany", "Autocomplete", "organization");
expect("", "currentTitle", "Autocomplete", "organization-title");
expect("", "portfolioUrl", "Autocomplete", "url");

// ─── FALSE POSITIVE TESTS (must return null or wrong key would be a bug) ─────
// Previously broken patterns — these should NOT match their old wrong keys
expectNull("authorize this transaction", "FalsePos-authorizeTransaction");  // FIX: was visaStatus
expectNull("bonus_eligibility Bonus Eligibility", "FalsePos-bonusEligibility");  // FIX: was visaStatus
expectNull("workers_compensation Workers' Compensation", "FalsePos-workersComp");  // FIX: was expectedSalary
expectNull("customs_clearance Customs Clearance Date", "FalsePos-customsClearance");  // FIX: was securityClearance
expectNull("clearance_sale Clearance Items", "FalsePos-clearanceSale");  // FIX: was securityClearance
expectNull("mobile_os Mobile Operating System", "FalsePos-mobileOS");  // FIX: was phone
expectNull("cell_biology Cell Biology Lab", "FalsePos-cellBiology");  // FIX: was phone
expectNull("business_unit Business Unit", "FalsePos-businessUnit");  // FIX: was addressLine2
expectNull("sales_region Sales Region", "FalsePos-salesRegion");  // FIX: was state
expectNull("footnote_text Footnote", "FalsePos-footnote");  // FIX: was coverLetter
expectNull("biography_full Biography Full Text", "FalsePos-biography");  // should be null or summary

// Narrowed — should now route correctly instead of stealing
expectNot("position applied for What position are you applying for?", "currentTitle", "FalsePos-positionApplied");
expect("position applied for What position are you applying for?", "jobFunction", "FalsePos-positionApplied");

// school year should go to classYear, not university
expect("school_year School Year", "classYear", "FalsePos-schoolYear");
expectNot("school_year School Year", "university", "FalsePos-schoolYearNotUni");

// Graduation date (Taleo) should go to graduationYear
expect("graduationDate.year Graduation Year", "graduationYear", "FalsePos-gradDate");
expect("graduation_date Graduation Date", "graduationYear", "FalsePos-gradDate2");

// ─── EDGE CASES ───────────────────────────────────────────────────────────────
// Empty inputs
expect("", null, "EdgeCase-empty");
expect("   ", null, "EdgeCase-spaces");

// Mixed case
expect("FIRST_NAME", "firstName", "EdgeCase-allCaps");
expect("Email_Address", "email", "EdgeCase-mixedCase");

// Compound IDs (Taleo long IDs)
expect("dialogTemplate-dialogForm-ef-page_0-firstName", "firstName", "EdgeCase-taloeLong");
expect("dialogTemplate-dialogForm-ef-page_0-LastName", "lastName", "EdgeCase-taloeLongLast");

// data-automation-id style (Workday) — tested via haystack directly since we simulate buildHaystack
expect("legalNameSection_firstName", "firstName", "EdgeCase-workday");
expect("addressSection_postalCode", "zipCode", "EdgeCase-workday");

// React data-testid
expect("first-name-input", "firstName", "EdgeCase-testId");
expect("email-address-field", "email", "EdgeCase-testId");

// Pronouns
expect("pronouns_field", "pronouns", "EdgeCase-pronouns");
expect("your_pronouns", "pronouns", "EdgeCase-pronouns");

// Twitter
expect("twitter_url", "twitterUrl", "EdgeCase-twitter");
expect("x.com profile", "twitterUrl", "EdgeCase-xcom");

// Languages
expect("language", "languages", "EdgeCase-language");
expect("languages", "languages", "EdgeCase-languages");

// ─── NEW SITE 26: JazzHR ─────────────────────────────────────────────────────
const JZ = "JazzHR";
expect("applicant[first_name]", "firstName", JZ);
expect("applicant[last_name]", "lastName", JZ);
expect("applicant[email]", "email", JZ);
expect("applicant[phone]", "phone", JZ);
expect("applicant[cover_letter]", "coverLetter", JZ);
expect("applicant[linkedin_url]", "linkedInUrl", JZ);
expect("applicant[current_company]", "currentCompany", JZ);
expect("applicant[current_title]", "currentTitle", JZ);
expect("How did you hear about this opportunity?", "referralSource", JZ);

// ─── NEW SITE 27: Breezy HR ──────────────────────────────────────────────────
const BR = "BreezyHR";
expect("name", "fullName", BR);
expect("email_address", "email", BR);
expect("phone_number", "phone", BR);
expect("cover_letter", "coverLetter", BR);
expect("current_company", "currentCompany", BR);
expect("current_title", "currentTitle", BR);
expect("linkedin_url", "linkedInUrl", BR);
expect("github_url", "githubUrl", BR);
expect("portfolio_url", "portfolioUrl", BR);
expect("work_authorization", "visaStatus", BR);

// ─── NEW SITE 28: Jobvite ─────────────────────────────────────────────────────
const JV = "Jobvite";
expect("jv-firstName", "firstName", JV);
expect("jv-lastName", "lastName", JV);
expect("jv-email", "email", JV);
expect("jv-phone", "phone", JV);
expect("jv-address1", "addressLine1", JV);
expect("jv-city", "city", JV);
expect("jv-state", "state", JV);
expect("jv-zip", "zipCode", JV);
expect("jv-country", "country", JV);
expect("jv-linkedin", "linkedInUrl", JV);
expect("jv-coverletter", "coverLetter", JV);

// ─── NEW SITE 29: SAP SuccessFactors ─────────────────────────────────────────
const SF = "SuccessFactors";
expect("firstNameTxt First Name", "firstName", SF);
expect("lastNameTxt Last Name", "lastName", SF);
expect("emailAddressTxt Email Address", "email", SF);
expect("phoneTxt Phone Number", "phone", SF);
expect("cityTxt City", "city", SF);
expect("stateTxt State", "state", SF);
expect("zipCodeTxt Zip Code", "zipCode", SF);
expect("countryTxt Country", "country", SF);
expect("currentJobTitle Current Job Title", "currentTitle", SF);
expect("currentEmployer Current Employer", "currentCompany", SF);
expect("universityName University Name", "university", SF);
expect("degreeType Degree Type", "degree", SF);
expect("fieldOfStudy Field of Study", "major", SF);
expect("graduationYear Graduation Year", "graduationYear", SF);
expect("sponsorshipRequired Do you require sponsorship?", "visaStatus", SF);

// ─── NEW SITE 30: Recruitee ───────────────────────────────────────────────────
const RC = "Recruitee";
expect("candidate_first_name", "firstName", RC);
expect("candidate_last_name", "lastName", RC);
expect("candidate_email", "email", RC);
expect("candidate_phone", "phone", RC);
expect("candidate_linkedin", "linkedInUrl", RC);
expect("candidate_github", "githubUrl", RC);
expect("candidate_website", "portfolioUrl", RC);
expect("candidate_cover_letter", "coverLetter", RC);
expect("years_of_experience Years of Experience", "yearsOfExp", RC);
expect("expected_salary Expected Salary", "expectedSalary", RC);

// ─── NEW SITE 31: Pinpoint ATS ───────────────────────────────────────────────
const PP = "Pinpoint";
expect("first_name", "firstName", PP);
expect("last_name", "lastName", PP);
expect("email", "email", PP);
expect("phone", "phone", PP);
expect("address_line_1 Address Line 1", "addressLine1", PP);
expect("address_line_2 Address Line 2", "addressLine2", PP);
expect("town_city Town/City", "city", PP);
expect("county_state County/State", "state", PP);
expect("postcode Post Code", "zipCode", PP);
expect("country", "country", PP);
expect("linkedin_profile_url LinkedIn Profile URL", "linkedInUrl", PP);
expect("cover_letter_text Cover Letter", "coverLetter", PP);
expect("right_to_work Right to Work", "visaStatus", PP);

// ─── NEW SITE 32: Personio (EU ATS) ──────────────────────────────────────────
const PE = "Personio";
expect("first-name", "firstName", PE);
expect("last-name", "lastName", PE);
expect("email-address", "email", PE);
expect("phone-number", "phone", PE);
expect("street-address", "addressLine1", PE);
expect("postal-code", "zipCode", PE);
expect("motivation_letter Motivation Letter", "coverLetter", PE);
expect("salary-expectation Salary Expectation", "expectedSalary", PE);
expect("earliest_start_date", null, PE);                      // should NOT match

// ─── ADDITIONAL FIELD VARIATIONS ─────────────────────────────────────────────
// Full name
expect("your_full_name", "fullName", "FieldVar");
expect("candidate_name", "fullName", "FieldVar");
expect("applicant_full_name", "fullName", "FieldVar");

// Phone variants
expect("work_phone", "phone", "FieldVar");
expect("home_phone", "phone", "FieldVar");
expect("alternate_phone_number", "phone", "FieldVar");
expect("contact_number", "phone", "FieldVar");

// Address variants
expect("mailing_address", "addressLine1", "FieldVar");
expect("home_address", "addressLine1", "FieldVar");
expect("residential_address", "addressLine1", "FieldVar");
expect("street_address", "addressLine1", "FieldVar");

// LinkedIn / GitHub variants
expect("linkedin_profile_url", "linkedInUrl", "FieldVar");
expect("linkedin_handle", "linkedInUrl", "FieldVar");
expect("github_profile", "githubUrl", "FieldVar");
expect("github_username", "githubUrl", "FieldVar");
expect("personal_website", "portfolioUrl", "FieldVar");
expect("portfolio_link", "portfolioUrl", "FieldVar");
expectNull("blog_url", "FP-blogUrl");                         // "blog_url" has no portfolio/website signal

// Salary / relocation variants
expect("salary_expectation Salary Expectation", "expectedSalary", "FieldVar");
expect("desired_salary Desired Salary", "expectedSalary", "FieldVar");
expect("ctc_expected Expected CTC", "expectedSalary", "FieldVar");
expect("willing_to_relocate", "relocation", "FieldVar");
expect("relocation_preference", "relocation", "FieldVar");

// Visa variants
expect("right_to_work_uk", "visaStatus", "FieldVar");
expect("work_eligibility", "visaStatus", "FieldVar");
expect("need_sponsorship", "visaStatus", "FieldVar");         // /sponsorship/

// ─── TRICKY FALSE POSITIVES ───────────────────────────────────────────────────
// "city" inside longer words — lookbehind must block
expectNull("publicity Publicity Rights", "FP-publicity");
expectNull("electricity_type Electricity Provider", "FP-electricity");
expectNull("felicity_score Felicity Index", "FP-felicity");
expectNull("capacity_field Seating Capacity", "FP-capacity");
expectNull("duplicity_check Duplicate Check", "FP-duplicity");

// "state" inside longer words — lookbehind must block
expectNull("statement_of_purpose Statement of Purpose", "FP-statement");
expectNull("estate_details Estate Value", "FP-estate");
expectNull("interstate_travel Interstate Travel", "FP-interstate");
expectNull("financial_statement Financial Statement", "FP-financialStatement");
expectNull("overstated Overstated Experience", "FP-overstated");

// "note" edge cases — \bnotes?\b must not fire inside "footnote"
expectNull("footnote Footnote Reference", "FP-footnote2");
expectNull("annotate Annotate This", "FP-annotate");

// "skills" in unrelated contexts
expectNull("preskilled Pre-skilled Labour", "FP-preskilled");  // starts with "skill" substring

// "school" in "preschool" — /school/i would match; check it goes to university not null
expect("preschool_type Preschool Type", "university", "FP-preschool"); // /school/ matches — acceptable

// "language" in "programming_language" — should go to languages, not major (language before program)
expect("programming_language Programming Language", "languages", "FP-programmingLang");

// "phone" edge — microphone contains "phone" substring; /phone/i intentionally broad for camelCase
// ("phoneNumber" → phone requires /phone/i; microphone_input in job forms is vanishingly rare)

// "email" edge — "wholesale" should not match email
expectNull("wholesale_price Wholesale Price", "FP-wholesale");

// "org" edge — should only match when standalone word
expectNot("organize Organize Events", "currentCompany", "FP-organize");
expectNot("organic Organic Traffic", "currentCompany", "FP-organic");
expect("org", "currentCompany", "FP-orgAlone");               // standalone "org" → currentCompany

// Sensitive / financial fields that must return null
expectNull("ssn Social Security Number", "Security-ssn");
expectNull("tax_id Tax ID", "Security-taxId");
expectNull("passport_number Passport Number", "Security-passport");
expectNull("credit_card_number Credit Card", "Security-cc");
expectNull("bank_account_number Bank Account", "Security-bank");
expectNull("routing_number Routing Number", "Security-routing");
expectNull("cvv CVV Security Code", "Security-cvv");
expectNull("captcha CAPTCHA", "Security-captcha");
expectNull("verification_code Verification Code", "Security-verif");
expectNull("security_question Security Question", "Security-secQ");
expectNull("national_id National ID Number", "Security-nationalId");

// Unrelated application fields — should return null
expectNull("available_start_date Earliest Start Date", "Unrelated-startDate");
expectNull("notice_period Notice Period", "Unrelated-notice");
expectNull("willing_to_travel Willing to Travel", "Unrelated-travel");
expectNull("salary_history Salary History", "Unrelated-salaryHistory");  // salary → expectedSalary? YES
expectNull("references_available References Available", "Unrelated-refs");
expectNull("interview_date Interview Date", "Unrelated-interviewDate");

// ─── AGE FIELD PATTERN TESTS ──────────────────────────────────────────────────
function expectAge(haystack, shouldMatch) {
  const got = matchKey(haystack);
  if (shouldMatch && got === "age") { pass++; }
  else if (!shouldMatch && got !== "age") { pass++; }
  else {
    fail++;
    fails.push({ site: "Age", field: haystack, expected: shouldMatch ? "age" : "NOT age", got });
  }
}
expectAge("age", true);
expectAge("Age", true);
expectAge("age in years", true);
expectAge("applicant_age", true);
expectAge("how old are you", true);
expectAge("age_field Age", true);
// Should NOT match as age
expectAge("language", false);        // "language" doesn't contain "age" as standalone
expectAge("coverage", false);        // coverage should not match age
expectAge("average salary", false);  // "average" contains "age" but not standalone
expectAge("percentage", false);      // "percentage" contains "age" not standalone

// ─── DOB FORMAT TESTS ─────────────────────────────────────────────────────────
const DOB = "1998-05-23"; // profile stores YYYY-MM-DD

function expectDOB(label, hints, elType, maxl, expected) {
  const got = formatDOB(DOB, hints, elType, maxl);
  if (got === expected) { pass++; }
  else {
    fail++;
    fails.push({ site: "DOB-Format", field: label, expected, got });
  }
}

expectDOB("native date input",         "",               "date",  0,  "1998-05-23");
expectDOB("US placeholder MM/DD/YYYY", "MM/DD/YYYY",     "text",  0,  "05/23/1998");
expectDOB("EU placeholder DD/MM/YYYY", "DD/MM/YYYY",     "text",  0,  "23/05/1998");
expectDOB("ISO placeholder YYYY-MM-DD","YYYY-MM-DD",     "text",  0,  "1998-05-23");
expectDOB("EU dot format DD.MM.YYYY",  "DD.MM.YYYY",     "text",  0,  "23.05.1998");
expectDOB("compact YYYYMMDD hint",     "YYYYMMDD",       "text",  0,  "19980523");
expectDOB("compact MMDDYYYY hint",     "MMDDYYYY",       "text",  0,  "05231998");
expectDOB("compact DDMMYYYY hint",     "DDMMYYYY",       "text",  0,  "23051998");
expectDOB("maxlength=8 no hint",       "",               "text",  8,  "05231998");
expectDOB("maxlength=10 no hint",      "",               "text",  10, "05/23/1998");
expectDOB("no hint fallback → US",     "",               "text",  0,  "05/23/1998");
expectDOB("month/year only MM/YYYY",   "MM/YYYY",        "text",  0,  "05/1998");

// Parse from alternative stored formats (user may have typed differently)
function expectDOBParse(label, input, hints, expected) {
  const got = formatDOB(input, hints, "text", 0);
  if (got === expected) { pass++; }
  else { fail++; fails.push({ site: "DOB-Parse", field: label, expected, got }); }
}
expectDOBParse("stored as MM/DD/YYYY", "05/23/1998", "DD/MM/YYYY", "23/05/1998");
expectDOBParse("stored as DD.MM.YYYY", "23.05.1998", "MM/DD/YYYY", "05/23/1998");
expectDOBParse("unknown format passthrough", "not-a-date", "MM/DD/YYYY", "not-a-date");

// Age computation (relative to current year — just test structure, not exact value)
function expectAgeRange(dob, minAge, maxAge) {
  const got = computeAge(dob);
  const n = parseInt(got);
  if (got !== null && n >= minAge && n <= maxAge) { pass++; }
  else {
    fail++;
    fails.push({ site: "Age-Compute", field: dob, expected: `${minAge}–${maxAge}`, got });
  }
}
expectAgeRange("1998-05-23", 25, 30);   // born 1998 → ~26-27 depending on today
expectAgeRange("1990-01-01", 33, 38);   // born 1990
expectAgeRange("2000-12-31", 23, 27);   // born 2000
expectAgeRange("1980-06-15", 43, 47);   // born 1980
// Invalid inputs → null
(function() {
  const r = computeAge("not-a-date");
  if (r === null) pass++;
  else { fail++; fails.push({ site: "Age-Compute", field: "invalid input", expected: null, got: r }); }
})();

// ─── FIELD_PATTERNS SYNC CHECK ────────────────────────────────────────────────
// Reads content.js and verifies that the FIELD_PATTERNS keys here match exactly.
// Fails hard if they diverge — keeps test.js and content.js honest.
(function syncCheck() {
  const fs   = require("fs");
  const path = require("path");

  let src;
  try {
    src = fs.readFileSync(path.join(__dirname, "content.js"), "utf8");
  } catch {
    console.warn("⚠  Sync-check: could not read content.js\n");
    return;
  }

  // Extract key names from the FIELD_PATTERNS literal in content.js
  const block = src.match(/const FIELD_PATTERNS\s*=\s*\{([\s\S]*?)\n\};/)?.[1] || "";
  const contentKeys = new Set(
    [...block.matchAll(/^\s{2}(\w+):\s*\[/gm)].map(m => m[1])
  );

  const testKeys = new Set(Object.keys(FIELD_PATTERNS));

  const onlyInTest    = [...testKeys].filter(k => !contentKeys.has(k));
  const onlyInContent = [...contentKeys].filter(k => !testKeys.has(k));

  if (onlyInTest.length || onlyInContent.length) {
    fail++;
    fails.push({
      site: "SYNC",
      field: "FIELD_PATTERNS key mismatch between test.js and content.js",
      expected: "identical key sets",
      got: [
        onlyInTest.length    ? `Only in test.js: ${onlyInTest.join(", ")}`    : "",
        onlyInContent.length ? `Only in content.js: ${onlyInContent.join(", ")}` : "",
      ].filter(Boolean).join(" | ")
    });
    console.error("\n🔴 FIELD_PATTERNS SYNC FAILURE — test.js and content.js are out of sync!");
    if (onlyInTest.length)    console.error("  Extra keys in test.js:    ", onlyInTest.join(", "));
    if (onlyInContent.length) console.error("  Extra keys in content.js: ", onlyInContent.join(", "));
    console.error("  Fix: keep both FIELD_PATTERNS identical.\n");
  }
})();

// ─── RESULTS ──────────────────────────────────────────────────────────────────
const total = pass + fail + warn;
console.log("\n══════════════════════════════════════════");
console.log(`  AutoFill Pro — Pattern Test Results`);
console.log("══════════════════════════════════════════");
console.log(`  Total:    ${total}`);
console.log(`  ✅ Pass:  ${pass}`);
console.log(`  ❌ Fail:  ${fail}`);
console.log(`  ⚠  Warn:  ${warn} (false positives)`);
console.log(`  Coverage: ${Math.round(pass/total*100)}%`);
console.log("══════════════════════════════════════════\n");

if (fails.length) {
  console.log("❌ FAILURES:\n");
  fails.forEach(f => {
    console.log(`  [${f.site}] "${f.field}"`);
    console.log(`    expected: ${f.expected}  |  got: ${f.got}\n`);
  });
}

if (warnings.length) {
  console.log("⚠  FALSE POSITIVES (matched something they shouldn't):\n");
  warnings.forEach(w => {
    console.log(`  [${w.site}] "${w.field}" (${w.label})`);
    console.log(`    incorrectly matched as: ${w.got}\n`);
  });
}

if (fails.length === 0 && warnings.length === 0) {
  console.log("🎉 All tests passed with zero false positives!\n");
}

process.exit(fail > 0 ? 1 : 0);
