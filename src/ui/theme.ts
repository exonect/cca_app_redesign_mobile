/** Design tokens from the approved CCA canvas, shared with the web app. */
export const color = {
  ink: '#231F20',
  ink2: '#3A3536',
  action: '#CC1219',
  logo: '#ED1B24',
  concrete: '#ECEEEF',
  surface: '#FFFFFF',
  head: '#F5F6F7',
  line: '#D5D9DC',
  divider: '#EEF0F1',
  field: '#9AA2A9',
  muted: '#5C646B',
  subtle: '#3F464C',
  link: '#2F5F8F',
  error: '#B3261E',
  amber: '#E59A3A',
  status: {
    draft: { bg: '#E3E6E8', fg: '#3F464C' },
    created: { bg: '#FFFFFF', fg: '#231F20', border: '#9AA2A9' },
    support_requested: { bg: '#FCEBD7', fg: '#8A4A06' },
    assigned_to_ct: { bg: '#DCE7F2', fg: '#1F4568' },
    trial_in_progress: { bg: '#2F5F8F', fg: '#FFFFFF' },
    trials_closed: { bg: '#D8EFE5', fg: '#0B5C43' },
    completed: { bg: '#0F7B5C', fg: '#FFFFFF' },
  },
  met: { bg: '#D8EFE5', fg: '#0B5C43', solid: '#0F7B5C' },
  below: { bg: '#FCEBD7', fg: '#8A4A06', solid: '#E59A3A' },
} as const

export const font = {
  regular: 'Barlow_400Regular',
  medium: 'Barlow_500Medium',
  semibold: 'Barlow_600SemiBold',
  bold: 'Barlow_700Bold',
  cond: 'BarlowSemiCondensed_600SemiBold',
  condBold: 'BarlowSemiCondensed_700Bold',
} as const

export const radius = { card: 10, field: 8, chip: 14 } as const
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const
/** Minimum touch target, platform guidance. */
export const TOUCH = 44
