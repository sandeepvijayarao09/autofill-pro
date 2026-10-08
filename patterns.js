// patterns.js — the field-matching rules, shared by the extension and the tests.
//
// Loaded as the FIRST content script (see manifest.json), so FIELD_PATTERNS and
// AUTOCOMPLETE_MAP are in scope for content.js. test.js require()s this same
// file, so the 1300 pattern tests run against the table that actually ships.
// Order matters: matchKey() returns the first key whose pattern hits.

const FIELD_PATTERNS = {
  // ── Identity ──────────────────────────────────────────────────────────────
  // preferredName BEFORE firstName: "preferred_first_name" must match preferred, not first
  preferredName:    [/preferred[\s_-]?(?:first[\s_-]?)?name/i, /preferred[\s_-]?first/i, /goes[\s_-]?by/i, /nickname/i],
  firstName:        [/first[\s_-]?name/i, /fname/i, /given[\s_-]?name/i, /forename/i],
  lastName:         [/last[\s_-]?name/i, /(?<![a-z])lname(?![a-z])/i, /surname/i, /family[\s_-]?name/i],
  fullName:         [/^name$/i, /full[\s_-]?name/i, /your[\s_-]?name/i, /^full$/i, /(?:candidate|applicant)[\s_-]?name/i],
  pronouns:         [/pronoun/i],
  email:            [/e[\s_-]?mail/i, /email[\s_-]?address/i, /^email$/i],
  phone:            [/phone/i, /^mobile$/i, /mobile[\s_-]?(?:phone|number|no)/i, /^cell$/i, /cell[\s_-]?(?:phone|number|no)/i, /telephone/i, /contact[\s_-]?number/i],
  dateOfBirth:      [/dob/i, /birth[\s_-]?date/i, /date[\s_-]?of[\s_-]?birth/i, /birthday/i],
  // age: computed from dateOfBirth at fill time (not stored in profile)
  // lookbehind prevents "language","coverage","percentage" from matching
  age:              [/(?<![a-z])age(?![\s_-]?(?:ncy|nt|nda|nts|s\b))(?![a-z])/i, /how[\s_-]?old/i],
  // lookbehind+lookahead prevents "yearsexperience" (contains s-e-x) from false-matching gender
  gender:           [/gender/i, /(?<![a-z])sex(?!ual)(?![a-z])/i],

  // ── Address ───────────────────────────────────────────────────────────────
  // /^location$/ added: Greenhouse uses "location" as a single address/city field
  // /address/ (no anchor) added: catches compound IDs like "dialogTemplate-...-Address"
  // negative lookahead on catch-all prevents "address_line_2" from matching addressLine1
  addressLine1:     [/address[\s_-]?(?:1|line[\s_-]?1)/i, /street[\s_-]?address/i, /^address$/i, /^street$/i, /^location$/i, /(?<![a-z])address(?![\s_-]?(?:line[\s_-]?)?2)(?![a-z])/i],
  addressLine2:     [/address[\s_-]?(?:2|line[\s_-]?2)/i, /^apt\.?$/i, /apartment/i, /suite/i, /^unit[\s_-]?(?:number|no\.?)?$/i],
  // lookbehind prevents "ethnicity" (contains "city") from matching; still catches compound IDs
  city:             [/(?<![a-z])city(?![a-z])/i, /^town$/i, /municipality/i],
  // lookbehind avoids "statement","status","estate"; location.region catches SmartRecruiters
  state:            [/(?<![a-z])state(?![a-z])/i, /^province$/i, /state[\s_-]?(?:or[\s_-]?)?province/i, /location[._]region/i],
  // /zip/ (no anchor) catches "iCIMS_field_Zip"
  // pin[\s_-]?code catches "pin_code" (Indian variant); ^pincode$ for exact match
  zipCode:          [/zip[\s_-]?code/i, /postal[\s_-]?code/i, /postcode/i, /zip/i, /pin[\s_-]?code/i, /^pincode$/i],
  // /country/ (no anchor) catches "iCIMS_field_Country", "location.country"
  country:          [/country/i],

  // ── Long-form fields BEFORE company (stops "Note to Employer" matching currentCompany) ──
  // coverLetter and messageToManager intentionally placed before currentCompany
  coverLetter:      [/cover[\s_-]?letter/i, /motivation[\s_-]?letter/i, /letter[\s_-]?of[\s_-]?intent/i, /\bnotes?\b/i, /note.*(?:recruiter|company|employer|hiring)/i],
  messageToManager: [/message.*(?:hiring|manager|recruiter)/i, /note.*(?:recruiter|company|employer)/i, /^comments?$/i, /additional[\s_-]?info(?:rmation)?/i],

  // ── Professional ──────────────────────────────────────────────────────────
  // designation unanchored: catches "CurrentDesignation", "current_designation" compound names
  currentTitle:     [/job[\s_-]?title/i, /current[\s_-]?(?:title|position|role)/i, /professional[\s_-]?title/i, /work[\s_-]?title/i, /designation/i, /headline/i, /role[\s_-]?title/i, /position[\s_-]?title/i, /job[\s_-]?role/i],
  currentCompany:   [/company/i, /employer/i, /organization/i, /organisation/i, /^firm$/i, /\borg\b/i],
  // total_experience, experience_in_years (Zoho, Manatal, Ceipal, Bullhorn compound patterns)
  yearsOfExp:       [/years[\s_-]?of[\s_-]?exp/i, /experience[\s_-]?years/i, /years[\s_-]?exp/i, /total[\s_-]?exp(?:erience)?/i, /exp(?:erience)?[\s_-]?(?:in[\s_-]?)?years?/i],
  // lookbehind prevents "pre-skilled" from matching; "skills" and "technical_skills" still match
  skills:           [/(?<![a-z])skills?(?![a-z])/i, /technical[\s_-]?skills/i, /key[\s_-]?skills/i, /expertise/i, /proficienc/i],
  // /language/ (no anchor) catches "language Language", "language Language"
  languages:        [/language/i, /language[\s_-]?proficienc/i, /spoken[\s_-]?language/i],
  securityClearance:[/security[\s_-]?clearance/i, /clearance[\s_-]?level/i, /(?:top[\s_-]?secret|ts[\s_-]?sci)[\s_-]?clearance/i],
  linkedInUrl:      [/linkedin/i],
  githubUrl:        [/github/i],
  // lookbehind on website catches "candidate_website" but not "website_design" etc.
  portfolioUrl:     [/portfolio/i, /personal[\s_-]?(?:url|site|website)/i, /^url$/i, /(?<![a-z])website(?![a-z])/i],
  twitterUrl:       [/twitter/i, /\bx\.com\b/i],

  // ── Education (classYear BEFORE university — "school year" → classYear, "school" → university) ──
  classYear:        [/class[\s_-]?year/i, /school[\s_-]?year/i, /academic[\s_-]?year/i],
  // /school/ (no anchor) catches "school_name"; classYear's priority ensures "school_year" won't land here
  university:       [/university/i, /college/i, /institution/i, /school/i],
  degree:           [/degree/i, /qualification/i],
  // /program/ added: Taleo uses "Program" for major/field of study
  major:            [/major/i, /field[\s_-]?of[\s_-]?study/i, /discipline/i, /^course$/i, /program/i],
  graduationYear:   [/grad[\s_-]?year/i, /graduation[\s_-]?(?:year|date)/i, /^year[\s_-]?of[\s_-]?grad/i, /pass[\s_-]?out/i],
  // /gpa/ (no anchor) catches compound IDs like "dialogTemplate-...-gpa"
  gpa:              [/gpa/i, /cgpa/i, /grade[\s_-]?point/i],

  // ── Work preferences ──────────────────────────────────────────────────────
  visaStatus:       [/visa/i, /work[\s_-]?auth(?:orization)?/i, /work[\s_-]?permit/i, /work[\s_-]?eligib/i, /right[\s_-]?to[\s_-]?work/i, /sponsorship/i],
  relocation:       [/relocat/i],
  workArrangement:  [/work[\s_-]?arrangement/i, /remote[\s_-]?prefer/i, /hybrid[\s_-]?prefer/i, /work[\s_-]?(?:setting|mode|type)/i],
  jobFunction:      [/job[\s_-]?function/i, /position[\s_-]?applied/i, /area.*interest/i, /department.*interest/i, /role.*interest/i],
  // negative lookahead excludes "salary_history" (past salary, not expected)
  // annual_income: banking/real-estate income fields map to salary expectation
  expectedSalary:   [/salary(?![\s_-]?histor)/i, /expected[\s_-]?comp/i, /desired[\s_-]?comp/i, /ctc/i, /pay[\s_-]?expect/i, /annual[\s_-]?income/i],

  // ── Remaining long-form ───────────────────────────────────────────────────
  summary:          [/summary/i, /\bbio\b/i, /about[\s_-]?me/i, /profile[\s_-]?summary/i, /professional[\s_-]?summary/i],
  referralSource:   [/how.*hear/i, /hear.*about/i, /referral[\s_-]?source/i, /how.*(?:find|learn).*(?:us|this|job|role)/i, /application[\s_-]?source/i],

  // ── EEOC / Diversity ──────────────────────────────────────────────────────
  raceEthnicity:    [/race/i, /ethnic/i, /racial/i],
  // military_service_status (USAJOBS style) — military[\s_-]?status was already present
  veteranStatus:    [/veteran/i, /protected[\s_-]?veteran/i, /military[\s_-]?status/i, /military[\s_-]?service/i],
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

// Node (tests) only; in the browser `module` is undefined and this is skipped.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { FIELD_PATTERNS, AUTOCOMPLETE_MAP };
}
