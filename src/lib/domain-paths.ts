/**
 * General starting points for common career domains in India — used for domain plans and for
 * career suggestions when AI isn't configured. Deliberately generic: a place to begin
 * exploring, not personalised advice. Entry routes name widely known exams/programmes only.
 */

export type ExplorationKindName = "MINI_PROJECT" | "SIMULATION" | "INFORMATIONAL_INTERVIEW" | "READING" | "SHADOWING" | "COURSE";

export type DomainPath = {
  domain: string;
  skills: string[];
  starterProjects: string[];
  roles: string[];
  entryRoutes: string[];
  exploration: { title: string; kind: ExplorationKindName; steps: string[] };
  /** Lower-case words in subject names that suggest an affinity. */
  subjects: string[];
};

export const DOMAIN_PATHS: DomainPath[] = [
  {
    domain: "Software engineering",
    skills: ["One programming language well (e.g. Python or Java)", "Data structures and algorithms", "Git and collaborative coding", "Building and deploying a small web app"],
    starterProjects: ["A to-do or expense tracker web app", "A script that automates a boring task", "Contribute a small fix to an open-source project"],
    roles: ["Software developer", "Web developer", "QA / test engineer"],
    entryRoutes: ["B.Tech/BCA/B.Sc CS or self-taught portfolio", "Internships via college placement cells and platforms", "Open-source programmes (e.g. GSoC)"],
    exploration: { title: "Build a tiny app in a weekend", kind: "MINI_PROJECT", steps: ["Pick a small problem you face", "Follow a beginner tutorial to set up a project", "Build the simplest working version", "Show it to someone and note what you enjoyed"] },
    subjects: ["computer", "programming", "informatics", "coding", "it"],
  },
  {
    domain: "Data science & AI",
    skills: ["Statistics and probability", "Python with pandas", "Data visualisation", "Basics of machine learning"],
    starterProjects: ["Analyse a public Indian dataset (e.g. data.gov.in)", "A chart-based story about your city", "A simple prediction model on a Kaggle dataset"],
    roles: ["Data analyst", "Business analyst", "ML engineer (later)"],
    entryRoutes: ["Degree in CS/statistics/maths/economics", "Analytics internships", "Online courses (NPTEL, SWAYAM)"],
    exploration: { title: "Tell a story with data", kind: "MINI_PROJECT", steps: ["Download a small dataset you care about", "Ask one question about it", "Make two charts that answer it", "Write three sentences on what surprised you"] },
    subjects: ["math", "statistic", "computer", "economics"],
  },
  {
    domain: "Design (UI/UX, product)",
    skills: ["Visual design basics", "User research and empathy", "Figma or similar tools", "Prototyping"],
    starterProjects: ["Redesign a screen of an app you use", "Interview 3 people about a frustrating app", "A small portfolio of 3 case studies"],
    roles: ["UI/UX designer", "Product designer", "Visual designer"],
    entryRoutes: ["B.Des (NID, NIFT, IIT/UCEED) or self-taught portfolio", "Design internships"],
    exploration: { title: "Redesign one app screen", kind: "MINI_PROJECT", steps: ["Pick a screen that annoys you", "Watch someone use it", "Sketch a better version", "Compare before and after"] },
    subjects: ["art", "design", "drawing", "fine arts"],
  },
  {
    domain: "Product management",
    skills: ["Understanding users", "Prioritisation", "Clear writing", "Basic data analysis"],
    starterProjects: ["Write a one-page improvement proposal for an app", "Compare two competing products"],
    roles: ["Associate product manager", "Product analyst"],
    entryRoutes: ["Usually after a few years in engineering, design or business roles", "APM programmes at some companies"],
    exploration: { title: "Write a product teardown", kind: "READING", steps: ["Pick an app you use daily", "List who it serves and why", "Find one problem and propose a fix", "Share it with a friend for feedback"] },
    subjects: ["business", "economics"],
  },
  {
    domain: "Finance & banking",
    skills: ["Accounting basics", "Excel/spreadsheets", "Financial statements", "Economics fundamentals"],
    starterProjects: ["Track and analyse a mock investment portfolio", "Read and summarise a company's annual report"],
    roles: ["Financial analyst", "Banking officer", "Investment analyst"],
    entryRoutes: ["B.Com/BBA/B.A. Economics", "Bank exams (IBPS, SBI PO)", "CFA / NISM certifications"],
    exploration: { title: "Read an annual report", kind: "READING", steps: ["Pick a listed Indian company you know", "Find its revenue and profit for two years", "Note one reason for the change", "Explain it to someone in two minutes"] },
    subjects: ["accountancy", "accounts", "commerce", "economics", "business", "math"],
  },
  {
    domain: "Chartered accountancy",
    skills: ["Accounting", "Taxation", "Auditing", "Business law"],
    starterProjects: ["Prepare a household budget with categories", "Solve past CA Foundation papers"],
    roles: ["Chartered accountant", "Auditor", "Tax consultant"],
    entryRoutes: ["ICAI: CA Foundation → Intermediate → articleship → Final"],
    exploration: { title: "Try a CA Foundation paper", kind: "COURSE", steps: ["Download a past Foundation paper from ICAI", "Attempt one section timed", "Check against the suggested answers", "Note what felt interesting or dull"] },
    subjects: ["accountancy", "accounts", "commerce"],
  },
  {
    domain: "Medicine & healthcare",
    skills: ["Biology and chemistry foundations", "Empathy and communication", "Handling stress and long study periods"],
    starterProjects: ["First-aid certification", "Volunteer at a health camp (where age-appropriate)"],
    roles: ["Doctor", "Nurse", "Pharmacist", "Physiotherapist", "Lab technologist"],
    entryRoutes: ["NEET-UG for MBBS/BDS/AYUSH", "Nursing, pharmacy and allied-health courses"],
    exploration: { title: "Talk to someone in healthcare", kind: "INFORMATIONAL_INTERVIEW", steps: ["Find a doctor, nurse or pharmacist you can ask", "Prepare 5 questions about their day", "Ask what they wish they’d known at your age", "Write down what appealed and what didn’t"] },
    subjects: ["biology", "chemistry", "zoology", "botany"],
  },
  {
    domain: "Law",
    skills: ["Reading and reasoning", "Writing arguments", "General awareness", "Public speaking"],
    starterProjects: ["Follow and summarise a Supreme Court case", "Join a debate or moot court"],
    roles: ["Lawyer", "Legal researcher", "Corporate counsel"],
    entryRoutes: ["CLAT / AILET for 5-year integrated LLB", "3-year LLB after graduation"],
    exploration: { title: "Follow one court case", kind: "READING", steps: ["Pick a case in the news", "Read a plain-language summary", "Write both sides’ arguments", "Decide what you’d argue and why"] },
    subjects: ["political science", "civics", "history", "legal"],
  },
  {
    domain: "Civil services",
    skills: ["Current affairs", "Indian polity, history and geography", "Essay writing", "Decision-making"],
    starterProjects: ["Read a newspaper editorial daily and summarise it", "Analyse a government scheme in your district"],
    roles: ["IAS/IPS/IFS officer", "State civil services"],
    entryRoutes: ["UPSC Civil Services Examination (after graduation)", "State PSC exams"],
    exploration: { title: "Study one government scheme", kind: "READING", steps: ["Pick a scheme that affects your area", "Find its goals and budget", "Ask someone who benefits from it", "Write what works and what could improve"] },
    subjects: ["history", "political science", "geography", "civics", "economics"],
  },
  {
    domain: "Teaching & education",
    skills: ["Explaining clearly", "Patience", "Subject depth", "Planning lessons"],
    starterProjects: ["Tutor a younger student for a month", "Make a short explainer video"],
    roles: ["School teacher", "Lecturer", "Instructional designer"],
    entryRoutes: ["B.Ed + CTET/TET for school teaching", "NET/SET for college teaching"],
    exploration: { title: "Teach one topic", kind: "MINI_PROJECT", steps: ["Pick a topic you know well", "Plan a 15-minute lesson", "Teach a friend or sibling", "Ask what helped them most"] },
    subjects: ["education", "english", "hindi", "marathi"],
  },
  {
    domain: "Research & academia",
    skills: ["Curiosity and reading papers", "Experiment design", "Scientific writing", "Mathematics"],
    starterProjects: ["A small experiment with a write-up", "Summer research programmes (e.g. IAS/INSA/NASI fellowships)"],
    roles: ["Researcher", "Scientist", "Professor"],
    entryRoutes: ["B.Sc/BS-MS (IISER, NISER), then M.Sc/PhD", "KVPY-style fellowships, IAT/NEST entrance"],
    exploration: { title: "Run a tiny experiment", kind: "MINI_PROJECT", steps: ["Ask a question you can test at home", "Write a prediction", "Collect simple measurements", "Write up results like a mini paper"] },
    subjects: ["physics", "chemistry", "biology", "math"],
  },
  {
    domain: "Core engineering (mechanical, civil, electrical)",
    skills: ["Physics and maths foundations", "Engineering drawing / CAD", "Practical problem-solving"],
    starterProjects: ["Build a simple machine or circuit", "Model a part in free CAD software"],
    roles: ["Mechanical / civil / electrical engineer", "Site engineer", "Design engineer"],
    entryRoutes: ["JEE Main/Advanced or state CETs for B.Tech", "Diploma (polytechnic) routes"],
    exploration: { title: "Build something that moves", kind: "MINI_PROJECT", steps: ["Pick a simple mechanism or circuit", "Gather basic materials", "Build and test it", "Note what you’d improve"] },
    subjects: ["physics", "math", "engineering", "mechanics"],
  },
  {
    domain: "Electronics & semiconductors",
    skills: ["Circuits and electronics", "Microcontrollers (e.g. Arduino)", "Digital logic"],
    starterProjects: ["An Arduino sensor project", "Repair or analyse a simple gadget"],
    roles: ["Electronics engineer", "Embedded systems engineer", "VLSI engineer"],
    entryRoutes: ["B.Tech ECE/EEE", "Diploma in electronics"],
    exploration: { title: "Make an Arduino sensor log", kind: "MINI_PROJECT", steps: ["Follow a starter Arduino tutorial", "Connect one sensor", "Log readings for a day", "Explain the circuit to someone"] },
    subjects: ["physics", "electronics", "computer"],
  },
  {
    domain: "Marketing & communications",
    skills: ["Writing and storytelling", "Understanding audiences", "Social media basics", "Simple analytics"],
    starterProjects: ["Run a social page for a club or cause", "Write a campaign for a local shop"],
    roles: ["Marketing executive", "Content writer", "Brand associate"],
    entryRoutes: ["BBA/BMS/B.A. or any degree with a portfolio", "Marketing internships"],
    exploration: { title: "Plan a mini campaign", kind: "SIMULATION", steps: ["Pick a local business or cause", "Define who it should reach", "Draft three posts", "Ask a friend which works best and why"] },
    subjects: ["english", "business", "commerce", "media"],
  },
  {
    domain: "Journalism & media",
    skills: ["Reporting and fact-checking", "Writing", "Interviewing", "Video/audio basics"],
    starterProjects: ["Write three local news stories", "Start a school or college newsletter"],
    roles: ["Reporter", "Editor", "Content producer"],
    entryRoutes: ["Journalism / mass communication degrees", "Internships at newspapers and digital outlets"],
    exploration: { title: "Report one local story", kind: "MINI_PROJECT", steps: ["Find a story in your neighbourhood", "Interview two people", "Check facts from a second source", "Write 300 words"] },
    subjects: ["english", "hindi", "marathi", "political science", "media"],
  },
  {
    domain: "Architecture",
    skills: ["Drawing and spatial thinking", "Design sensitivity", "Maths and physics basics"],
    starterProjects: ["Sketch and measure a room or building you like", "Model a small house in free 3D software"],
    roles: ["Architect", "Urban planner", "Interior designer"],
    entryRoutes: ["NATA / JEE Main Paper 2 for B.Arch"],
    exploration: { title: "Redesign a room", kind: "MINI_PROJECT", steps: ["Measure a room at home", "Draw it to scale", "Redesign it for a need", "Explain your choices"] },
    subjects: ["art", "drawing", "math", "physics"],
  },
  {
    domain: "Biotechnology & life sciences",
    skills: ["Biology and chemistry", "Lab techniques", "Reading research", "Data analysis"],
    starterProjects: ["A home fermentation or plant-growth experiment with notes", "Summarise a biotech news story"],
    roles: ["Lab scientist", "Biotech research associate", "Quality control analyst"],
    entryRoutes: ["B.Sc/B.Tech Biotechnology", "IISER/NISER programmes"],
    exploration: { title: "Grow and measure", kind: "MINI_PROJECT", steps: ["Plant seeds in two conditions", "Measure growth every two days", "Chart the results", "Explain the difference"] },
    subjects: ["biology", "chemistry", "biotechnology"],
  },
  {
    domain: "Psychology",
    skills: ["Understanding people", "Research methods", "Listening and empathy", "Statistics"],
    starterProjects: ["Run a small anonymous survey with consent", "Read and summarise an introductory psychology text"],
    roles: ["Counselling psychologist (with further study)", "HR professional", "UX researcher"],
    entryRoutes: ["B.A./B.Sc Psychology, then M.A./M.Sc", "RCI-recognised programmes for clinical practice"],
    exploration: { title: "Run a tiny survey", kind: "MINI_PROJECT", steps: ["Pick a harmless question about study habits", "Ask 10 classmates with consent", "Summarise the answers", "Note what surprised you"] },
    subjects: ["psychology", "sociology", "biology"],
  },
  {
    domain: "Entrepreneurship",
    skills: ["Spotting problems", "Talking to customers", "Basic finance", "Persistence"],
    starterProjects: ["Sell a small product or service to 5 customers", "Interview 10 people about a problem"],
    roles: ["Founder", "Early employee at a startup"],
    entryRoutes: ["College incubators and E-cells", "Government schemes (e.g. Startup India)"],
    exploration: { title: "Validate a small idea", kind: "SIMULATION", steps: ["Write down a problem you’ve seen", "Ask 5 people if they face it", "Sketch a solution", "Note whether anyone would pay"] },
    subjects: ["business", "economics", "commerce"],
  },
  {
    domain: "Defence services",
    skills: ["Physical fitness", "Leadership", "General awareness", "Maths and English"],
    starterProjects: ["NCC participation", "A fitness plan you follow for 6 weeks"],
    roles: ["Officer in Army/Navy/Air Force"],
    entryRoutes: ["NDA after Class 12", "CDS / AFCAT after graduation"],
    exploration: { title: "Talk to an NCC cadet or veteran", kind: "INFORMATIONAL_INTERVIEW", steps: ["Find someone with service or NCC experience", "Ask about a typical day", "Ask about challenges", "Reflect on whether it suits you"] },
    subjects: ["physics", "math", "geography"],
  },
  {
    domain: "Agriculture & food",
    skills: ["Biology and chemistry", "Field work", "Understanding markets"],
    starterProjects: ["A kitchen-garden experiment", "Visit a farm or market and document the supply chain"],
    roles: ["Agricultural officer", "Food technologist", "Agri-business associate"],
    entryRoutes: ["B.Sc Agriculture (ICAR AIEEA, state exams)", "Food technology degrees"],
    exploration: { title: "Trace your food", kind: "READING", steps: ["Pick one vegetable you eat", "Find where it’s grown", "Ask a vendor about prices", "Map its journey to your plate"] },
    subjects: ["biology", "chemistry", "agriculture", "geography"],
  },
  {
    domain: "Environment & sustainability",
    skills: ["Environmental science", "Data and field observation", "Communication"],
    starterProjects: ["A waste or water audit at home or school", "Map trees in your area"],
    roles: ["Environmental consultant", "Sustainability analyst", "Conservation worker"],
    entryRoutes: ["Environmental science degrees", "Internships with NGOs"],
    exploration: { title: "Do a home waste audit", kind: "MINI_PROJECT", steps: ["Track your household’s waste for 3 days", "Sort it into categories", "Find one change", "Measure again after a week"] },
    subjects: ["environmental", "geography", "biology", "chemistry"],
  },
];

export function pathFor(domain: string): DomainPath | null {
  const d = domain.toLowerCase();
  return DOMAIN_PATHS.find((p) => p.domain.toLowerCase() === d) ?? DOMAIN_PATHS.find((p) => d.includes(p.domain.toLowerCase().split(" ")[0])) ?? null;
}

/** Domains whose subject keywords match a subject name. */
export function domainsForSubject(subjectName: string): string[] {
  const s = subjectName.toLowerCase();
  return DOMAIN_PATHS.filter((p) => p.subjects.some((k) => new RegExp(`\\b${k}`).test(s))).map((p) => p.domain);
}
