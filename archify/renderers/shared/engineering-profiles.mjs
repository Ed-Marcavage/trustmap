import { throwDiagnosticError } from './diagnostics.mjs';

const DEPLOYMENT_PROFILE = 'deployment-ownership';
const CONTRACT_SECURITY_PROFILE = 'contract-security';
const DEPLOYMENT_BOUNDARY_KINDS = new Set(['region', 'security-group']);
const PRIVATE_STATE_TYPES = new Set(['database']);

function subject(profile, collection, index, item = {}) {
  return {
    diagramType: 'architecture',
    profile,
    collection,
    index,
    ...(item.id ? { id: item.id } : {}),
  };
}

function membership(boundaries, componentId, kind) {
  return boundaries
    .map((boundary, index) => ({ boundary, index }))
    .filter(({ boundary }) => boundary.kind === kind && boundary.wraps.includes(componentId));
}

export function deploymentOwnershipDiagnostics(diagram) {
  const components = Array.isArray(diagram.components) ? diagram.components : [];
  const boundaries = (Array.isArray(diagram.boundaries) ? diagram.boundaries : [])
    .map((boundary) => ({ ...boundary, wraps: Array.isArray(boundary.wraps) ? boundary.wraps : [] }));
  const connections = Array.isArray(diagram.connections) ? diagram.connections : [];
  const diagnostics = [];

  for (const kind of DEPLOYMENT_BOUNDARY_KINDS) {
    const count = boundaries.filter((boundary) => boundary.kind === kind).length;
    if (count > 0) continue;
    diagnostics.push({
      code: 'engineering/deployment-boundary-kind',
      severity: 'error',
      message: `Deployment ownership requires at least one ${kind} boundary.`,
      subject: subject(DEPLOYMENT_PROFILE, 'boundaries', -1),
      evidence: { requiredKind: kind, found: count },
      supportedFixes: [`add one ${kind} boundary with an explicit wraps list`],
    });
  }

  components.forEach((component, index) => {
    if (component.type === 'external') return;
    if (typeof component.tag !== 'string' || component.tag.trim() === '') {
      diagnostics.push({
        code: 'engineering/deployment-owner-missing',
        severity: 'error',
        message: `Deployment component ${JSON.stringify(component.id)} does not name its owner in tag.`,
        subject: subject(DEPLOYMENT_PROFILE, 'components', index, component),
        evidence: { componentType: component.type, ownerField: 'tag' },
        supportedFixes: [`set /components/${index}/tag to the responsible team or owner`],
      });
    }

    const regions = membership(boundaries, component.id, 'region');
    if (regions.length === 0) {
      diagnostics.push({
        code: 'engineering/deployment-region-scope',
        severity: 'error',
        message: `Deployment component ${JSON.stringify(component.id)} is not assigned to a region boundary.`,
        subject: subject(DEPLOYMENT_PROFILE, 'components', index, component),
        evidence: { componentType: component.type, regionMemberships: 0 },
        supportedFixes: ['add the component id to the real region boundary wraps list'],
      });
    } else if (regions.length > 1) {
      diagnostics.push({
        code: 'engineering/deployment-region-ambiguous',
        severity: 'error',
        message: `Deployment component ${JSON.stringify(component.id)} belongs to more than one region boundary.`,
        subject: subject(DEPLOYMENT_PROFILE, 'components', index, component),
        evidence: {
          componentType: component.type,
          regions: regions.map(({ boundary, index: boundaryIndex }) => ({ boundaryIndex, label: boundary.label })),
        },
        supportedFixes: ['keep the component id in exactly one real region boundary wraps list'],
      });
    }

    if (PRIVATE_STATE_TYPES.has(component.type)) {
      const privateScopes = membership(boundaries, component.id, 'security-group');
      if (privateScopes.length === 0) {
        diagnostics.push({
          code: 'engineering/deployment-private-state',
          severity: 'error',
          message: `Stateful component ${JSON.stringify(component.id)} is not assigned to a private security-group boundary.`,
          subject: subject(DEPLOYMENT_PROFILE, 'components', index, component),
          evidence: { componentType: component.type, privateMemberships: 0 },
          supportedFixes: ['add the component id to the real private security-group boundary wraps list'],
        });
      }
    }
  });

  boundaries.forEach((boundary, index) => {
    if (boundary.kind !== 'security-group') return;
    const members = boundary.wraps.map((id) => ({
      id,
      regions: membership(boundaries, id, 'region').map(({ boundary: region, index: boundaryIndex }) => ({
        boundaryIndex,
        label: region.label,
      })),
    }));
    const regionIndexes = new Set(members.flatMap((member) => member.regions.map((region) => region.boundaryIndex)));
    const consistent = members.length > 0
      && members.every((member) => member.regions.length === 1)
      && regionIndexes.size === 1;
    if (consistent) return;
    diagnostics.push({
      code: 'engineering/deployment-private-region-consistency',
      severity: 'error',
      message: `Private boundary ${JSON.stringify(boundary.label)} must contain components from exactly one shared region.`,
      subject: subject(DEPLOYMENT_PROFILE, 'boundaries', index, boundary),
      evidence: { boundaryKind: boundary.kind, members },
      supportedFixes: ['assign every private-boundary component to exactly one shared region boundary'],
    });
  });

  connections.forEach((connection, index) => {
    const crossedBoundaries = boundaries
      .map((boundary, boundaryIndex) => ({
        boundaryIndex,
        kind: boundary.kind,
        label: boundary.label,
        fromInside: boundary.wraps.includes(connection.from),
        toInside: boundary.wraps.includes(connection.to),
      }))
      .filter((boundary) => DEPLOYMENT_BOUNDARY_KINDS.has(boundary.kind) && boundary.fromInside !== boundary.toInside);
    if (crossedBoundaries.length === 0 || (typeof connection.label === 'string' && connection.label.trim() !== '')) return;
    diagnostics.push({
      code: 'engineering/deployment-crossing-mechanism',
      severity: 'error',
      message: `Cross-boundary connection ${JSON.stringify(connection.id || `${connection.from}->${connection.to}`)} does not name its mechanism.`,
      subject: subject(DEPLOYMENT_PROFILE, 'connections', index, connection),
      evidence: {
        from: connection.from,
        to: connection.to,
        crossedBoundaries: crossedBoundaries.map(({ boundaryIndex, kind, label }) => ({ boundaryIndex, kind, label })),
      },
      supportedFixes: [`set /connections/${index}/label to the real cross-boundary mechanism`],
    });
  });

  return diagnostics;
}

export function contractSecurityDiagnostics(diagram) {
  const components = Array.isArray(diagram.components) ? diagram.components : [];
  const boundaries = (Array.isArray(diagram.boundaries) ? diagram.boundaries : [])
    .map((boundary) => ({ ...boundary, wraps: Array.isArray(boundary.wraps) ? boundary.wraps : [] }));
  const connections = Array.isArray(diagram.connections) ? diagram.connections : [];
  const diagnostics = [];
  const componentsById = new Map(components.map((component, index) => [component.id, { component, index }]));
  const typeOf = (id) => componentsById.get(id)?.component.type;
  const hasGuard = (connection) => typeof connection.guard === 'string' && connection.guard.trim() !== '';
  const connectionName = (connection) => connection.id || `${connection.from}->${connection.to}`;

  const trustBoundaryCount = boundaries.filter((boundary) => boundary.kind === 'trust-boundary').length;
  if (trustBoundaryCount === 0) {
    diagnostics.push({
      code: 'security/trust-boundary-missing',
      severity: 'error',
      message: 'Contract security requires at least one trust-boundary separating in-scope contracts from what they do not trust.',
      subject: subject(CONTRACT_SECURITY_PROFILE, 'boundaries', -1),
      evidence: { requiredKind: 'trust-boundary', found: trustBoundaryCount },
      supportedFixes: ['add one trust-boundary boundary with an explicit wraps list'],
    });
  }

  components.forEach((component, index) => {
    if (component.type === 'contract') {
      const scopes = membership(boundaries, component.id, 'trust-boundary');
      if (scopes.length !== 1) {
        diagnostics.push({
          code: 'security/scope-ambiguous',
          severity: 'error',
          message: `Contract ${JSON.stringify(component.id)} must belong to exactly one trust-boundary, found ${scopes.length}.`,
          subject: subject(CONTRACT_SECURITY_PROFILE, 'components', index, component),
          evidence: {
            componentType: component.type,
            requiredKind: 'trust-boundary',
            memberships: scopes.map(({ boundary, index: boundaryIndex }) => ({ boundaryIndex, label: boundary.label })),
          },
          supportedFixes: ['keep the contract id in exactly one trust-boundary wraps list'],
        });
      }
    }

    if (component.type === 'role') {
      const domains = membership(boundaries, component.id, 'privilege-domain');
      if (domains.length === 0) {
        diagnostics.push({
          code: 'security/scope-ambiguous',
          severity: 'error',
          message: `Role ${JSON.stringify(component.id)} is not assigned to a privilege-domain boundary.`,
          subject: subject(CONTRACT_SECURITY_PROFILE, 'components', index, component),
          evidence: { componentType: component.type, requiredKind: 'privilege-domain', memberships: [] },
          supportedFixes: ['add the role id to the real privilege-domain boundary wraps list'],
        });
      }
    }

    if (component.upgradeable === true) {
      const domains = membership(boundaries, component.id, 'upgrade-domain');
      const adminEdges = connections
        .map((connection, connectionIndex) => ({ connection, connectionIndex }))
        .filter(({ connection }) => connection.to === component.id && typeOf(connection.from) === 'role');
      if (domains.length === 0 || adminEdges.length === 0) {
        const fixes = [];
        if (domains.length === 0) fixes.push('add the component id to the real upgrade-domain boundary wraps list');
        if (adminEdges.length === 0) fixes.push('add the real admin connection from the upgrading role into this component');
        diagnostics.push({
          code: 'security/upgrade-admin-missing',
          severity: 'error',
          message: `Upgradeable component ${JSON.stringify(component.id)} must sit in an upgrade-domain boundary and receive an inbound edge from a role.`,
          subject: subject(CONTRACT_SECURITY_PROFILE, 'components', index, component),
          evidence: {
            componentType: component.type,
            upgradeDomains: domains.map(({ boundary, index: boundaryIndex }) => ({ boundaryIndex, label: boundary.label })),
            adminEdges: adminEdges.map(({ connection, connectionIndex }) => ({
              connectionIndex,
              from: connection.from,
            })),
          },
          supportedFixes: fixes,
        });
      }
    }
  });

  connections.forEach((connection, index) => {
    const crossedBoundaries = boundaries
      .map((boundary, boundaryIndex) => ({
        boundaryIndex,
        kind: boundary.kind,
        label: boundary.label,
        fromInside: boundary.wraps.includes(connection.from),
        toInside: boundary.wraps.includes(connection.to),
      }))
      .filter((boundary) => boundary.kind === 'trust-boundary' && boundary.fromInside !== boundary.toInside);
    if (crossedBoundaries.length > 0 && !hasGuard(connection)) {
      diagnostics.push({
        code: 'security/crossing-guard-missing',
        severity: 'error',
        message: `Trust-boundary crossing ${JSON.stringify(connectionName(connection))} does not name its guard.`,
        subject: subject(CONTRACT_SECURITY_PROFILE, 'connections', index, connection),
        evidence: {
          from: connection.from,
          to: connection.to,
          crossedBoundaries: crossedBoundaries.map(({ boundaryIndex, label }) => ({ boundaryIndex, label })),
        },
        supportedFixes: [`set /connections/${index}/guard to the real crossing guard or the explicit literal none`],
      });
    }

    if (typeOf(connection.from) === 'role' && typeOf(connection.to) === 'contract') {
      const missing = [];
      if (typeof connection.label !== 'string' || connection.label.trim() === '') missing.push('label');
      if (!hasGuard(connection)) missing.push('guard');
      if (missing.length > 0) {
        diagnostics.push({
          code: 'security/privileged-edge-unscoped',
          severity: 'error',
          message: `Privileged edge ${JSON.stringify(connectionName(connection))} from role ${JSON.stringify(connection.from)} does not name its ${missing.join(' and ')}.`,
          subject: subject(CONTRACT_SECURITY_PROFILE, 'connections', index, connection),
          evidence: { from: connection.from, to: connection.to, missing },
          supportedFixes: missing.map((field) => (field === 'label'
            ? `set /connections/${index}/label to the gated entry point`
            : `set /connections/${index}/guard to the access check on this entry point`)),
        });
      }
    }

    if (connection.classification === 'read' && typeOf(connection.to) === 'oracle' && !hasGuard(connection)) {
      diagnostics.push({
        code: 'security/oracle-check-missing',
        severity: 'error',
        message: `Oracle read ${JSON.stringify(connectionName(connection))} does not name its staleness or deviation check.`,
        subject: subject(CONTRACT_SECURITY_PROFILE, 'connections', index, connection),
        evidence: { from: connection.from, to: connection.to, classification: connection.classification },
        supportedFixes: [`set /connections/${index}/guard to the staleness/deviation check or the explicit literal none`],
      });
    }
  });

  return diagnostics;
}

const PROFILE_DIAGNOSTICS = new Map([
  [DEPLOYMENT_PROFILE, deploymentOwnershipDiagnostics],
  [CONTRACT_SECURITY_PROFILE, contractSecurityDiagnostics],
]);

export function validateEngineeringProfile(diagramType, diagram) {
  const profile = diagram.meta?.engineering_profile;
  if (!profile) return;
  if (diagramType !== 'architecture') return;
  const diagnosticsFor = PROFILE_DIAGNOSTICS.get(profile);
  if (!diagnosticsFor) return;
  const diagnostics = diagnosticsFor(diagram);
  if (!diagnostics.length) return;
  throwDiagnosticError(
    `Engineering profile ${JSON.stringify(profile)} failed:\n${diagnostics.map((entry) => `- ${entry.message}`).join('\n')}`,
    diagnostics,
  );
}
