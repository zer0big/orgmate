import type { HttpRequest } from '@azure/functions';

export interface AuthenticatedUser {
  /** Stable Entra ID object id. Used as the data partition key. */
  userId: string;
  /** Display name or UPN, best effort. */
  displayName: string;
  /** Declared app roles or Azure AD role names provided by Easy Auth. */
  roles: string[];
  /** True when the principal carries an explicit admin role. */
  isAdmin: boolean;
}

interface ClientPrincipalClaim {
  typ: string;
  val: string;
}

interface ClientPrincipal {
  auth_typ?: string;
  name_typ?: string;
  claims?: ClientPrincipalClaim[];
}

const OBJECT_ID_CLAIMS = [
  'http://schemas.microsoft.com/identity/claims/objectidentifier',
  'oid',
];

const NAME_CLAIMS = [
  'name',
  'preferred_username',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
];

const ROLE_CLAIMS = [
  'roles',
  'role',
  'http://schemas.microsoft.com/ws/2008/06/identity/claims/role',
];

function findClaim(claims: ClientPrincipalClaim[], names: string[]): string | undefined {
  for (const name of names) {
    const claim = claims.find((c) => c.typ === name);
    if (claim?.val) {
      return claim.val;
    }
  }
  return undefined;
}

function findClaims(claims: ClientPrincipalClaim[], names: string[]): string[] {
  const matches: string[] = [];
  for (const claim of claims) {
    if (names.includes(claim.typ) && claim.val) {
      matches.push(claim.val);
    }
  }
  return matches;
}

/**
 * Reads the identity injected by App Service Easy Auth.
 * The platform has already validated the bearer token before the request
 * reaches the worker, so the header can be trusted when Easy Auth is enforced.
 */
export function getUser(request: HttpRequest): AuthenticatedUser | undefined {
  const header = request.headers.get('x-ms-client-principal');
  if (!header) {
    return undefined;
  }

  let principal: ClientPrincipal;
  try {
    principal = JSON.parse(Buffer.from(header, 'base64').toString('utf8')) as ClientPrincipal;
  } catch {
    return undefined;
  }

  const claims = principal.claims ?? [];
  const userId = findClaim(claims, OBJECT_ID_CLAIMS);
  if (!userId) {
    return undefined;
  }

  const roles = findClaims(claims, ROLE_CLAIMS)
    .map((role) => role.trim())
    .filter(Boolean);

  const normalizedRoles = roles.map((role) => role.toLowerCase());
  const isAdmin = normalizedRoles.some(
    (role) => role.includes('admin') || role.includes('administrator') || role.includes('orgmate-admin'),
  );

  return {
    userId,
    displayName: findClaim(claims, NAME_CLAIMS) ?? userId,
    roles,
    isAdmin,
  };
}
