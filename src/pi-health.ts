export interface PiRegistrationHealth {
  toolsRegistered: number;
  toolRegistrationFailures: string[];
  hooksRegistered: number;
  hookRegistrationFailures: string[];
  updatedAt: string | null;
}

const registrationHealth: PiRegistrationHealth = {
  toolsRegistered: 0,
  toolRegistrationFailures: [],
  hooksRegistered: 0,
  hookRegistrationFailures: [],
  updatedAt: null,
};

export function resetPiRegistrationHealth(): void {
  registrationHealth.toolsRegistered = 0;
  registrationHealth.toolRegistrationFailures = [];
  registrationHealth.hooksRegistered = 0;
  registrationHealth.hookRegistrationFailures = [];
  registrationHealth.updatedAt = new Date().toISOString();
}

export function markToolRegistered(name: string): void {
  registrationHealth.toolsRegistered += 1;
  registrationHealth.updatedAt = new Date().toISOString();
  removeFailure(registrationHealth.toolRegistrationFailures, name);
}

export function markToolRegistrationFailed(name: string): void {
  registrationHealth.updatedAt = new Date().toISOString();
  addFailure(registrationHealth.toolRegistrationFailures, name);
}

export function markHookRegistered(name: string): void {
  registrationHealth.hooksRegistered += 1;
  registrationHealth.updatedAt = new Date().toISOString();
  removeFailure(registrationHealth.hookRegistrationFailures, name);
}

export function markHookRegistrationFailed(name: string): void {
  registrationHealth.updatedAt = new Date().toISOString();
  addFailure(registrationHealth.hookRegistrationFailures, name);
}

export function getPiRegistrationHealth(): PiRegistrationHealth {
  return {
    toolsRegistered: registrationHealth.toolsRegistered,
    toolRegistrationFailures: [...registrationHealth.toolRegistrationFailures],
    hooksRegistered: registrationHealth.hooksRegistered,
    hookRegistrationFailures: [...registrationHealth.hookRegistrationFailures],
    updatedAt: registrationHealth.updatedAt,
  };
}

function addFailure(target: string[], name: string): void {
  if (!target.includes(name)) {
    target.push(name);
  }
}

function removeFailure(target: string[], name: string): void {
  const index = target.indexOf(name);
  if (index >= 0) {
    target.splice(index, 1);
  }
}
