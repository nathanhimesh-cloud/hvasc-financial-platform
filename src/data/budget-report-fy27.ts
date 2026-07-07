/**
 * FY2026-27 Budget vs Actual source data, transcribed from Practical's
 * "Revenue and Expenditure Report" (Budget for Full Year), one per Report Group:
 *   - Corporate Services  (report group "Finance Director")
 *   - Operations          (report group "Operations Manager")
 *   - Social Services      (report group "Social Services Director")
 *
 * Actuals are as at 31 Jul 2026 (~9% of the year elapsed) — near zero this early.
 * Full-year budget figures are the adopted FY27 budget now loaded in Practical.
 *
 * This is a build-time seed so the report renders with real budget numbers for
 * the v2 review. It is replaced by the live Practical export / ODBC pull once
 * that report is wired (same {@link BudgetReportData} shape). Every group's
 * roll-up is verified against the source report's printed subtotals by
 * `scripts/verify-budget-report.mjs`.
 */

import type { BudgetReportData, BudgetLeaf, BudgetKind } from "@/lib/budget-report";

type Row = [code: string, name: string, kind: "R" | "E", actual: number, budget: number];
interface Block {
  program: string;
  sub?: string;
  sub3?: string;
  rows: Row[];
}

function flatten(blocks: Block[]): BudgetLeaf[] {
  return blocks.flatMap((b) =>
    b.rows.map(
      ([code, name, k, actual, budget]): BudgetLeaf => ({
        code,
        name,
        kind: (k === "R" ? "revenue" : "expense") as BudgetKind,
        actual,
        budget,
        program: b.program,
        sub: b.sub,
        sub3: b.sub3,
      }),
    ),
  );
}

const corporateServices: Block[] = [
  {
    program: "1000-0001 ADMINISTRATION",
    sub: "1150-0002 FAG FINANCIAL ASSISTANCE GRANT",
    rows: [
      ["1156-1100", "FAGS Grant Allocation", "R", 0, 3999399],
      ["1166-2000", "RENTAL EXPENSES", "E", 0, 20000],
    ],
  },
  {
    program: "1000-0001 ADMINISTRATION",
    sub: "1200-0002 GENERAL ADMINISTRATION",
    rows: [
      ["1200-2285", "Bank Charges", "E", 0, 50000],
      ["1200-2286", "ANZ BANK CHARGES 483906703", "E", 0, 500],
      ["1200-2295", "Consultants", "E", 0, 352000],
      ["1210-1100", "SGFA Grant Income", "R", 0, 2885897],
      ["1250-1575", "ANZ INTEREST 482156381 RECEIVED", "R", 0, 50],
      ["1250-1600", "Accrued Interest - QTC", "R", 0, 2160000],
      ["1255-2000", "Salaries and Wages", "E", 0, 1599136],
      ["1260-2000", "Administration Expenses", "E", 2156.43, 1281314],
      ["1270-2000", "Audit Fees", "E", 0, 160000],
      ["1276-2000", "Legal Fees", "E", 0, 100000],
      ["1277-2000", "IT and Communication Upgrade", "E", 0, 477380],
      ["1277-2100", "Accounting Systems Development", "E", 0, 200000],
      ["1277-2200", "Civica Management Reports update", "E", 0, 60000],
      ["1278-2000", "Dashboard Consultancy", "E", 0, 16400],
      ["1279-2000", "Subscriptions and Membership", "E", 0, 10800],
      ["1281-2000", "Motor Vehicle Expenses", "E", 0, 200000],
      ["1282-2000", "Depreciation", "E", 0, 5439660],
      ["1295-2000", "Governance - Remuneration", "E", 0, 316893],
      ["1296-2000", "Governance - Administration Expenses", "E", 0, 90900],
      ["1296-2100", "Council Budget Contingency", "E", 0, 500000],
      ["1297-2000", "Governance - Discretionary", "E", 0, 25000],
    ],
  },
  {
    program: "1000-0001 ADMINISTRATION",
    sub: "1600-0002 ONCOSTS SUB-PROGRAM",
    rows: [
      ["1615-2000", "Sick Leave Expense ONCOSTS", "E", 0, 296518],
      ["1620-2000", "LSL Expense", "E", 0, 126989],
      ["1625-2000", "Annual Leave Expense", "E", 0, 492081],
      ["1635-2000", "Superannuation Expense", "E", 0, 761931],
    ],
  },
  {
    program: "8100-0001 ECONOMIC DEVELOPMENT",
    rows: [
      ["8955-1100", "Lease Payments", "R", 0, 78637],
      ["8956-1100", "Meeting Room Hire", "R", 0, 80000],
      ["8965-2000", "Repairs & Maintenance", "E", 0, 300000],
      ["8966-2000", "Pioneer Hall Replacement furniture", "E", 0, 80000],
    ],
  },
];

const operations: Block[] = [
  {
    program: "1000-0001 ADMINISTRATION",
    sub: "1200-0002 GENERAL ADMINISTRATION",
    rows: [
      ["1215-1500", "Yearly Utility Charges Council", "R", 0, 685444],
      ["1215-1501", "Rates on Non 40 Year Lease Propertys", "R", 0, 696000],
    ],
  },
  {
    program: "1000-0001 ADMINISTRATION",
    sub: "1300-0002 Workplace Health and Safety",
    rows: [
      ["1300-2001", "Consulting Costs", "E", 0, 100000],
      ["1300-2002", "PPE", "E", 0, 20000],
      ["1300-2003", "Materials", "E", 0, 20000],
    ],
  },
  {
    program: "1000-0001 ADMINISTRATION",
    sub: "1500-0002 STORES OPERATIONS",
    rows: [["1505-2000", "Operational Costs", "E", 333.96, 34117]],
  },
  {
    program: "4000-0001 ESSENTIAL SERVICES",
    sub: "4040-0002 PARKS & GARDENS",
    sub3: "4040-0003 PARKS & GARDENS - COUNCIL",
    rows: [
      ["4046-2000", "Parks & Gardens - Salary & Wages", "E", 0, 321451],
      ["4047-2000", "Parks & Gardens - Admin Expenses", "E", 97.42, 100550],
    ],
  },
  {
    program: "4000-0001 ESSENTIAL SERVICES",
    sub: "4049-0002 BOR R5 Community & Cultural Park",
    rows: [["4049-2000", "Training and Development", "E", 0, 10000]],
  },
  {
    program: "4000-0001 ESSENTIAL SERVICES",
    sub: "4050-0002 ROADS",
    rows: [["4050-2000", "Tree and Shrub clearance", "E", 0, 150000]],
  },
  {
    program: "4000-0001 ESSENTIAL SERVICES",
    sub: "4050-0002 ROADS",
    sub3: "4075-0003 ROADS - DLGP IDENTIFIED",
    rows: [
      ["4080-1131", "QRRRF 22-23 Spring Hill Rd Culverts", "R", 0, 900000],
      ["4080-1132", "QRA Betterment Alligator Creek Rd", "R", 0, 168447],
      ["4080-1133", "QRA Betterment Cooktown-Mcivor Rd", "R", 0, 1000000],
      ["4080-1134", "Roads To Recovery Tee Tree Rd Seal", "R", 0, 25000],
      ["4080-2031", "QRRRF 22-23 Spring Hill Rd Culverts", "E", 0, 900000],
      ["4080-2032", "QRA Betterment Alligator Creek Rd", "E", 0, 168447],
      ["4080-2033", "QRA Betterment Cooktown-Mcivor Rd", "E", 0, 1000000],
      ["4080-2034", "Roads To Recovery Tee Tree Rd Seal", "E", 0, 25000],
    ],
  },
  {
    program: "4000-0001 ESSENTIAL SERVICES",
    sub: "4100-0002 WATER",
    rows: [
      ["4115-2000", "Water Salaries and Wages", "E", 0, 150844],
      ["4120-2000", "Water Administration Expenses", "E", 0, 29896],
      ["4121-2000", "Water-Consultants", "E", 0, 154343],
      ["4121-2100", "Water-Electricity", "E", 0, 24925],
      ["4121-2300", "Water-Materials", "E", 0, 7599],
      ["4121-2400", "Water-Repairs and Maintenance", "E", 0, 12362],
      ["4121-2500", "Water-Fuel", "E", 0, 397],
      ["4121-2600", "Water-Miscellaneous", "E", 0, 883],
    ],
  },
  {
    program: "4000-0001 ESSENTIAL SERVICES",
    sub: "4150-0002 SEWERAGE",
    rows: [
      ["4165-2000", "Water - Salaries and Wages", "E", 0, 79973],
      ["4165-2100", "Sewerage-Consultants", "E", 0, 13773],
      ["4165-2200", "Sewerage-Electricity", "E", 0, 12418],
      ["4165-2300", "Sewerage-Materials", "E", 0, 23457],
      ["4165-2400", "Sewerage-Repairs and Maintenance", "E", 0, 3934],
      ["4165-2500", "Sewerage-Fuel", "E", 0, 2707],
      ["4165-2600", "Desludge Sewerage Ponds", "E", 0, 60000],
      ["4170-2000", "Water Administration Expenses", "E", 0, 342],
    ],
  },
  {
    program: "4000-0001 ESSENTIAL SERVICES",
    sub: "4200-0002 WASTE MANAGEMENT",
    rows: [
      ["4215-2000", "Salaries and Wages", "E", 0, 45738],
      ["4215-2100", "Waste Management-Salaries and Wages", "E", 0, 4680],
      ["4215-2200", "Waste Mgt-Motor Vehicle Expenses", "E", 0, 47578],
    ],
  },
  {
    program: "4000-0001 ESSENTIAL SERVICES",
    sub: "4270-0002 ICCIP CAPITAL GRANT 2018",
    rows: [
      ["4280-1100", "ICCIP 2018 Water Grant", "R", 0, 1043616],
      ["4285-1100", "ICCIP 2018 Sewerage Grant", "R", 0, 90866],
      ["4285-2100", "Closing the gap project costs", "E", 0, 1134482],
      ["4285-2200", "Closing The Gap Project Costs", "E", 0, 0],
    ],
  },
  {
    program: "4000-0001 ESSENTIAL SERVICES",
    sub: "4350-0002 SERVICES WORKSHOP TECHNICAL",
    rows: [
      ["4351-1850", "Workshop - Building Lease", "R", 0, 12000],
      ["4366-2000", "Workshop Plant Maintenance", "E", 0, 150000],
      ["4368-2000", "Vehicle Registrations", "E", 0, 45000],
    ],
  },
  {
    program: "5000-0001 HOUSING & CONSTRUCTION",
    sub: "5100-0002 HOUSING",
    rows: [
      ["5100-1550", "Rent", "R", 0, 143412],
      ["5100-1555", "DOH Rent", "R", 0, 1680],
    ],
  },
  {
    program: "5000-0001 HOUSING & CONSTRUCTION",
    sub: "5100-0002 HOUSING",
    sub3: "5130-0003 QBUILD - COUNCIL HOUSING REP &",
    rows: [
      ["5131-1100", "QBuild Do & Charges Revenue", "R", 4793.01, 2364332],
      ["5145-2000", "QBuild Housing Rep & Maint", "E", 0, 1176641],
    ],
  },
  {
    program: "5000-0001 HOUSING & CONSTRUCTION",
    sub: "5180-0002 BUILDING ADMINISTRATION",
    rows: [
      ["5186-2000", "Project Management Salaries", "E", 0, 1101845],
      ["5188-2000", "Project Management MV Expenses", "E", 0, 4062],
      ["5190-2000", "Project Management Administration", "E", 0, 282197],
      ["5193-1000", "QBuild Software Revenue", "R", 0, 100000],
      ["5193-2000", "Project Management Freight", "E", 0, 117337],
      ["5193-2100", "QBuild Software Implementation Costs", "E", 0, 100000],
    ],
  },
  {
    program: "5000-0001 HOUSING & CONSTRUCTION",
    sub: "5200-0002 RENOVATIONS",
    rows: [
      ["5205-1100", "Renovations - ATSI Housing", "R", 0, 1223947],
      ["5210-2000", "Administration Expenses", "E", 0, 868831],
      ["5215-2000", "Renovations WIP", "E", 0, 0],
    ],
  },
  {
    program: "5000-0001 HOUSING & CONSTRUCTION",
    sub: "5870-0002 ROOFING PROGRAM 2016",
    rows: [
      ["5871-1100", "ROOF PROGRAM REVENUE", "R", 0, 571298],
      ["5872-2000", "ROOF PROGRAM MATERIALS", "E", 0, 225467],
    ],
  },
  {
    program: "6000-0001 LAND & SEA MANAGEMENT",
    sub: "6450-0002 EMERGENCY SERVICES",
    rows: [
      ["6450-1100", "Emergency Services Grant", "R", 0, 75000],
      ["6465-2000", "Administration Expenses", "E", 0, 86296],
    ],
  },
  {
    program: "7000-0001 HEALTH AND SOCIAL WELFARE",
    sub: "7600-0002 ANIMAL MANAGEMENT",
    rows: [
      ["7605-1100", "Animal Management Grant", "R", 0, 213948],
      ["7610-2000", "Animal Management Salaries & Wages", "E", 0, 76653],
      ["7615-2000", "Animal Mgt Administration Expenses", "E", 0, 116419],
      ["7620-2000", "Animal Management WIP", "E", 0, 59533],
    ],
  },
];

const socialServices: Block[] = [
  {
    program: "3000-0001 EDUCATION YOUTH AND",
    sub: "3050-0002 SWIMMING POOL COMPLEX",
    rows: [
      ["3055-1200", "Cape Flattery Contribution", "R", 0, 25000],
      ["3056-1100", "Materials", "R", 0, 0],
      ["3065-2000", "Swimming Pool Administration Expense", "E", 0, 10000],
      ["3066-2000", "Repairs and Maintenance", "E", 0, 30000],
      ["3067-2000", "Operational Expenses", "E", 0, 25000],
    ],
  },
  {
    program: "3000-0001 EDUCATION YOUTH AND",
    sub: "3150-0002 RIBS BROADCASTING",
    rows: [
      ["3150-1100", "Ribs Broadcasting DCITA Grant", "R", 0, 119134],
      ["3150-2000", "Ribs Broadcasting Operating Expenses", "E", 0, 20000],
      ["3155-2000", "Ribs Broadcasting Admin Exps", "E", 0, 8000],
      ["3157-2000", "Repairs and Maintenance", "E", 0, 18000],
      ["3158-2000", "Vehicle Expenses", "E", 0, 5000],
      ["3159-2000", "Salaries and Wages", "E", 0, 126903],
    ],
  },
  {
    program: "3000-0001 EDUCATION YOUTH AND",
    sub: "3300-0002 SPORT AND RECREATION",
    rows: [
      ["3310-1100", "Sport Grant - State", "R", 0, 121944],
      ["3315-2000", "S & R Salaries and Wages", "E", 0, 171074],
      ["3317-2000", "S&R Program Exps", "E", 0, 20000],
      ["3320-2000", "S & R Administration Expenses", "E", 0, 26825],
    ],
  },
  {
    program: "3000-0001 EDUCATION YOUTH AND",
    sub: "3400-0002 YOUTH",
    sub3: "3425-0003 INDIGENOUS LEARNING CENTRE",
    rows: [
      ["3432-1100", "State Library Grant", "R", 0, 23000],
      ["3434-1200", "ILC First 5 Forever Grant", "R", 0, 3000],
      ["3435-2000", "ILC - Salaries & Wages", "E", 0, 68569],
      ["3440-2000", "ILC Administration Expenses", "E", 0, 10000],
      ["3440-2001", "Operational Costs", "E", 0, 15000],
      ["3441-2000", "Repairs and Maintenance", "E", 0, 8000],
    ],
  },
  {
    program: "3000-0001 EDUCATION YOUTH AND",
    sub: "3800-0002 NAIDOC WEEK ICC FUNDING",
    rows: [
      ["3810-1100", "NAIDOC WEEK ICC GRANT ASSISTANCE", "R", 0, 10000],
      ["3810-1101", "NAIDOC Week Grant Assistance-State", "R", 0, 2500],
      ["3830-2000", "NAIDOC WEEK ICC PROGRAM EXP", "E", 0, 12500],
    ],
  },
  {
    program: "3000-0001 EDUCATION YOUTH AND",
    sub: "3850-0002 Events Budget",
    rows: [
      ["3850-1000", "Events Revenue", "R", 0, 100000],
      ["3850-2001", "Events Wages", "E", 0, 112622],
      ["3850-2002", "Events Expenses", "E", 0, 75000],
      ["3851-2000", "Rodeo Expenses", "E", 0, 63000],
      ["3852-2000", "Administration Expenses", "E", 0, 10000],
    ],
  },
  {
    program: "3000-0001 EDUCATION YOUTH AND",
    sub: "3950-0002 C&K Creche Grant funding",
    rows: [
      ["3960-1100", "C&K Grant Funding", "R", 0, 233892],
      ["3965-2000", "C&K Grant Salaries and Wages", "E", 0, 219204],
      ["3970-2000", "C&K Grant Admin Expenses", "E", 0, 35000],
      ["3971-2000", "Operational Expenses", "E", 0, 40000],
      ["3972-2000", "Training and Development", "E", 0, 124000],
      ["3973-2000", "Repairs and Maintenance", "E", 0, 20000],
    ],
  },
  {
    program: "5000-0001 HOUSING & CONSTRUCTION",
    sub: "5340-0002 CRRO Iniative",
    rows: [
      ["5340-1000", "CRRO initative", "R", 0, 450000],
      ["5340-2200", "CRRO Initiative Expenses", "E", 0, 450000],
    ],
  },
  {
    program: "7000-0001 HEALTH AND SOCIAL WELFARE",
    sub: "7005-0002 AGED CARE",
    rows: [
      ["7020-1550", "Residents Aged Person Hostel -Income", "R", 0, 10000],
      ["7021-1200", "NH BENEFITS APH -Income", "R", 0, 1533757],
      ["7025-2000", "Salaries and Wages", "E", 0, 105650],
      ["7030-2000", "Administration Expenses", "E", 0, 20000],
      ["7051-2000", "Divestment Costs", "E", 0, 5000],
      ["7051-2100", "Operating Expenses", "E", 0, 701849],
      ["7051-2200", "Motor Vehicle Expenses", "E", 0, 20000],
    ],
  },
  {
    program: "7000-0001 HEALTH AND SOCIAL WELFARE",
    sub: "7131-0002 GRANT - IEI",
    rows: [
      ["7131-1100", "Grant - IEI Revenue", "R", 0, 848164],
      ["7131-2000", "IEI - Salaries and Wages", "E", 0, 748164],
      ["7131-2200", "IEI - Other Expenditure", "E", 0, 100000],
    ],
  },
  {
    program: "7000-0001 HEALTH AND SOCIAL WELFARE",
    sub: "7135-0002 DISABILITY SUPPORT",
    rows: [
      ["7148-1100", "QCSS EMERGENCY RELIEF GRANT", "R", 0, 10000],
      ["7149-1100", "Community Connector Grant Funding", "R", 0, 160672],
      ["7151-1100", "QCSS Grant", "R", 0, 29038],
      ["7151-2000", "Operating Expenses", "E", 0, 20000],
      ["7151-2100", "Motor Vehicle Expenses", "E", 0, 5000],
      ["7153-2000", "Dis Serv Sal & Wages Day Service", "E", 0, 100636],
      ["7154-2000", "Dis Serv Admin Expenses Day Service", "E", 0, 30000],
      ["7155-2000", "Dis Serv Admin Expenses ALSP", "E", 0, 7500],
      ["7158-2000", "Dis Serv Admin Exps Non-Recurrent", "E", 0, 30000],
      ["7160-2000", "Disability Support WIP", "E", 0, 5000],
      ["7162-2000", "Dis Serv Building Inclusive Commun", "E", 0, 4505],
    ],
  },
  {
    program: "7000-0001 HEALTH AND SOCIAL WELFARE",
    sub: "7250-0002 YOUTH & SOCIAL SUPPORT",
    rows: [
      ["7260-1100", "YOUTH & SOCIAL SUPPORT GRANT", "R", 0, 119757],
      ["7265-2000", "YOUTH & SOCIAL SU Salaries and Wages", "E", 0, 68569],
      ["7270-2000", "YOUTH & SOCIAL SUPPOR Administration", "E", 0, 10000],
      ["7271-2000", "Equipment and Resources", "E", 0, 50000],
      ["7272-2000", "Operational Expenses", "E", 0, 31500],
      ["7273-2000", "Motor Vehicle Expenses", "E", 0, 10000],
    ],
  },
  {
    program: "7000-0001 HEALTH AND SOCIAL WELFARE",
    sub: "7500-0002 CHILD CARE",
    sub3: "7550-0003 CHILD CARE CENTRE - FEDERAL",
    rows: [
      ["7560-1100", "FACS (Fed) - Child Care Centre Grant", "R", 0, 548434],
      ["7564-1100", "Childcare Government Subsidy Payment", "R", 0, 263822],
      ["7565-1300", "Child Care Fees", "R", 0, 122350],
      ["7571-2000", "Divestment costs", "E", 0, 5000],
      ["7588-2000", "Salaries and Wages", "E", 0, 525811],
    ],
  },
  {
    program: "7000-0001 HEALTH AND SOCIAL WELFARE",
    sub: "7700-0002 HACC",
    rows: [
      ["7705-1100", "HACC Grant", "R", 0, 639319],
      ["7710-2000", "HACC Salaries & Wages Direct", "E", 0, 350162],
      ["7725-2100", "Divestment Costs", "E", 0, 5000],
      ["7726-2000", "Operational Expenses", "E", 0, 150000],
      ["7727-2000", "Repairs and Maintenance", "E", 0, 40000],
      ["7728-2000", "Motor Vehicle Expenses", "E", 0, 10000],
    ],
  },
];

export const budgetReportFY27: BudgetReportData = {
  fyLabel: "FY2026–27",
  asAt: "31 Jul 2026",
  yearElapsedPct: 0.09,
  source: "Practical Revenue & Expenditure Report (Budget for Full Year)",
  groups: [
    { id: "corporate-services", name: "Corporate Services", manager: "Finance Director", leaves: flatten(corporateServices) },
    { id: "operations", name: "Operations", manager: "Operations Manager", leaves: flatten(operations) },
    { id: "social-services", name: "Social Services", manager: "Social Services Director", leaves: flatten(socialServices) },
  ],
};
