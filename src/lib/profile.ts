/** The signed-in user. Hard-coded until authentication is added (Phase 3). */
export interface Profile {
  name: string;
  email: string;
  role: string;
  initials: string;
}

export const PROFILE: Profile = {
  name: "Micah Nkiwane",
  email: "micah.nkiwane@hopevale.qld.gov.au",
  role: "Finance · Hope Vale ASC",
  initials: "MN",
};
