export const RAW_URL_SOURCE = "(?:https?:\\/\\/|linear:\\/\\/)[^\\s]+"
export const RAW_URL_AT_START_PATTERN = new RegExp(`^(${RAW_URL_SOURCE})`)
