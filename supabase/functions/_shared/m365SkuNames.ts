/**
 * Mapping of Microsoft 365 / Entra SKU partNumber → human friendly name.
 * Source: https://learn.microsoft.com/azure/active-directory/enterprise-users/licensing-service-plan-reference
 *
 * Used by sync-entra-licencas to populate `entra_licencas.friendly_name`.
 * Fallback: the skuPartNumber itself.
 */
export const M365_SKU_FRIENDLY: Record<string, string> = {
  // Office 365 / Microsoft 365 core
  ENTERPRISEPACK: "Office 365 E3",
  ENTERPRISEPREMIUM: "Office 365 E5",
  STANDARDPACK: "Office 365 E1",
  DESKLESSPACK: "Office 365 F3",
  SPE_E3: "Microsoft 365 E3",
  SPE_E5: "Microsoft 365 E5",
  // SPE_F1 is the partNumber of Microsoft 365 F3 (renamed by Microsoft in April 2020).
  // The legacy F1 plan uses partNumber M365_F1.
  SPE_F1: "Microsoft 365 F3",
  SPE_F3: "Microsoft 365 F3",
  M365_F1: "Microsoft 365 F1",
  M365EDU_A1: "Microsoft 365 A1",
  M365EDU_A3_FACULTY: "Microsoft 365 A3 (Faculty)",
  M365EDU_A5_FACULTY: "Microsoft 365 A5 (Faculty)",
  SPB: "Microsoft 365 Business Premium",
  SMB_BUSINESS: "Microsoft 365 Business Standard",
  SMB_BUSINESS_ESSENTIALS: "Microsoft 365 Business Basic",
  SMB_BUSINESS_PREMIUM: "Microsoft 365 Business Premium",
  O365_BUSINESS: "Microsoft 365 Apps for Business",
  O365_BUSINESS_ESSENTIALS: "Microsoft 365 Business Basic",
  O365_BUSINESS_PREMIUM: "Microsoft 365 Business Standard",
  OFFICESUBSCRIPTION: "Microsoft 365 Apps for Enterprise",
  EXCHANGESTANDARD: "Exchange Online (Plan 1)",
  EXCHANGEENTERPRISE: "Exchange Online (Plan 2)",
  EXCHANGEARCHIVE: "Exchange Online Archiving for Exchange Server",
  EXCHANGEARCHIVE_ADDON: "Exchange Online Archiving for Exchange Online",
  EXCHANGEDESKLESS: "Exchange Online Kiosk",
  SHAREPOINTSTORAGE: "Office 365 Extra File Storage",
  WINDOWS_STORE: "Windows Store for Business",
  EXCHANGEARCHIVE: "Exchange Online Archiving for Exchange Server",
  EXCHANGEARCHIVE_ADDON: "Exchange Online Archiving for Exchange Online",
  EXCHANGEDESKLESS: "Exchange Online Kiosk",

  // Teams / phone
  MCOMEETADV: "Microsoft 365 Audio Conferencing",
  MCOEV: "Microsoft Teams Phone Standard",
  MCOPSTN1: "Microsoft Teams Domestic Calling Plan",
  MCOPSTN2: "Microsoft Teams Domestic & International Calling Plan",
  PHONESYSTEM_VIRTUALUSER: "Microsoft Teams Phone Resource Account",
  Microsoft_Teams_Rooms_Pro: "Microsoft Teams Rooms Pro",
  Microsoft_Teams_Exploratory_Dept: "Microsoft Teams Exploratory (for Departments)",
  TEAMS_EXPLORATORY: "Microsoft Teams Exploratory",
  "Teams_Premium_(for_Departments)": "Microsoft Teams Premium (for Departments)",
  Teams_Premium: "Microsoft Teams Premium",

  // Power Platform / Dynamics
  POWER_BI_PRO: "Power BI Pro",
  POWER_BI_STANDARD: "Power BI (Free)",
  POWER_BI_PREMIUM_PER_USER: "Power BI Premium Per User",
  FLOW_FREE: "Microsoft Power Automate Free",
  POWERAPPS_VIRAL: "Microsoft Power Apps Plan 2 Trial",
  POWERAPPS_DEV: "Microsoft Power Apps for Developer",
  POWERAUTOMATE_ATTENDED_RPA: "Power Automate per user with attended RPA",
  POWERAPPS_PER_APP_NEW: "Power Apps per app plan",
  Power_Pages_vTrial_for_Makers: "Power Pages vTrial for Makers",
  Power_Automate_per_process: "Power Automate per process plan",
  Power_Virtual_Agents: "Power Virtual Agents",
  CCIBOTS_PRIVPREV_VIRAL: "Power Virtual Agents Viral Trial",
  DYN365_ENTERPRISE_SALES: "Dynamics 365 Sales Enterprise",
  DYN365_ENTERPRISE_CUSTOMER_SERVICE: "Dynamics 365 Customer Service Enterprise",
  D365_SALES_PRO_IW: "Dynamics 365 Sales Professional Trial",
  D365_MARKETING_USER: "Dynamics 365 Customer Insights - Journeys",
  DYN365_BUSINESS_MARKETING: "Dynamics 365 Marketing Business Edition",
  DYN365_MARKETING_APP_ATTACH: "Dynamics 365 Customer Insights - Journeys Attach",
  DYN365_MARKETING_CONTACT_ADDON_T4: "Dynamics 365 Marketing Additional Contacts Tier 4",
  DYN365_MARKETING_SANDBOX_APPLICATION_ADDON: "Dynamics 365 Marketing Additional Sandbox",
  DYN365_TEAM_MEMBERS: "Dynamics 365 Team Members",
  DYN365_CUSTOMER_INSIGHTS_VIRAL: "Dynamics 365 Customer Insights Viral Trial",
  DYN365_AI_SERVICE_INSIGHTS: "Dynamics 365 Customer Service Insights Trial",
  D365_VIRTUAL_AGENT_USL: "Dynamics 365 Virtual Agent",
  Dynamics_365_Customer_Service_Enterprise_viral_trial: "Dynamics 365 Customer Service Enterprise Viral Trial",
  Dynamics_365_Sales_Premium_Viral_Trial: "Dynamics 365 Sales Premium Viral Trial",
  CDS_DB_CAPACITY: "Common Data Service Database Capacity",
  CDS_LOG_CAPACITY: "Common Data Service Log Capacity",
  CDSAICAPACITY: "AI Builder Capacity Add-on",
  MICROSOFT_BUSINESS_CENTER: "Microsoft Business Center",
  Microsoft_Cloud_for_Sustainability_vTrial: "Microsoft Cloud for Sustainability Trial",
  FORMS_PRO: "Dynamics 365 Customer Voice Trial",

  // Security / EM&S
  EMS: "Enterprise Mobility + Security E3",
  EMSPREMIUM: "Enterprise Mobility + Security E5",
  AAD_PREMIUM: "Microsoft Entra ID P1",
  AAD_PREMIUM_P2: "Microsoft Entra ID P2",
  RIGHTSMANAGEMENT: "Azure Information Protection Plan 1",
  INTUNE_A: "Microsoft Intune Plan 1",

  // Visio / Project / misc
  VISIOCLIENT: "Visio Plan 2",
  PROJECTPROFESSIONAL: "Project Plan 3",
  PROJECTPREMIUM: "Project Plan 5",
  STREAM: "Microsoft Stream Trial",
  WIN10_PRO_ENT_SUB: "Windows 10/11 Enterprise E3",
  WIN10_VDA_E5: "Windows 10/11 Enterprise E5",
};

const TRIAL_HINT_REGEX = /(VIRAL|TRIAL|FREE|vTrial|_DEV)/i;

/** Heuristic: treat as trial when name signals it OR when pool is absurdly large with negligible usage. */
export function isTrialSku(skuPartNumber: string, enabled: number, consumed: number): boolean {
  if (TRIAL_HINT_REGEX.test(skuPartNumber)) return true;
  if (enabled >= 10000 && consumed < Math.max(1, enabled * 0.01)) return true;
  return false;
}

export function friendlyName(skuPartNumber: string): string {
  return M365_SKU_FRIENDLY[skuPartNumber] ?? skuPartNumber;
}
