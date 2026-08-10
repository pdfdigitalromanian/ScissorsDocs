import type { IconName } from '@/components/icons/Icon'

export interface AppRoute {
  path: string
  label: string
  description: string
  icon: IconName
}

/**
 * Single source of truth for primary navigation.
 * Consumed by the router (route generation) and the sidebar nav.
 */
export const appRoutes: AppRoute[] = [
  {
    path: '/',
    label: 'Home',
    description: 'ScissorsDoc is a modern document workspace platform.',
    icon: 'home',
  },
  {
    path: '/workspace',
    label: 'Workspace',
    description: 'Open and edit documents inside the ScissorsDoc workspace.',
    icon: 'workspace',
  },
  {
    path: '/tools',
    label: 'Tools',
    description:
      'Quick document tools such as merge, split, compress and convert.',
    icon: 'tools',
  },
  {
    path: '/ai',
    label: 'AI',
    description: 'AI-powered document assistance.',
    icon: 'ai',
  },
  {
    path: '/recent',
    label: 'Recent',
    description: 'Documents you have worked on recently.',
    icon: 'recent',
  },
  {
    path: '/favorites',
    label: 'Favorites',
    description: 'Documents you have marked as favorites.',
    icon: 'favorites',
  },
  {
    path: '/settings',
    label: 'Settings',
    description: 'Manage application preferences and settings.',
    icon: 'settings',
  },
]
