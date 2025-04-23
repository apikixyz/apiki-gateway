export interface ApiKeyConfig {
  active: boolean;
  expiresAt: number | null;
  clientId: string;
  targetId: string;
  // overrides: {
  //   [targetId: string]: {
  //     costMultiplier: number;
  //   };
  // };
}

export interface TargetConfig {
  id: string;
  name: string;
  pattern: string;
  isRegex: boolean;
  targetUrl: string;
  costInfo: {
    cost: number;
    description: string;
  };
}

export interface CreditResult {
  success: boolean;
  remaining: number;
  used: number;
}
