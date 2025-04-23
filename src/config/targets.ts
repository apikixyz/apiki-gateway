import type { TargetConfig } from '@/shared/types';

export const targets: TargetConfig[] = [
  {
    id: 'api-target1',
    name: 'API v1 Target',
    pattern: '/api/v1/*',
    isRegex: false,
    targetUrl: 'https://api-backend.example.com',
    costInfo: {
      cost: 2,
      description: 'Standard API endpoint',
    },
  },
  {
    id: 'complex-target',
    name: 'Complex API',
    pattern: '^/complex/.*$',
    isRegex: true,
    targetUrl: 'https://complex-api.example.com',
    costInfo: {
      cost: 5,
      description: 'High-resource usage endpoint',
    },
  },
];
