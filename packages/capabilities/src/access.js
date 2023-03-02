/**
 * Access Capabilities
 *
 * These can be imported directly with:
 * ```js
 * import * as Access from '@web3-storage/capabilities/access'
 * ```
 *
 * @module
 */
import { capability, URI, DID, Link, Schema, Failure } from '@ucanto/validator'
import * as Types from '@ucanto/interface'
import { equalWith, fail, equal } from './utils.js'
export { top } from './top.js'

/**
 * Account identifier.
 */
export const Account = DID.match({ method: 'mailto' })

/**
 * Describes the capability requested.
 */
export const CapabilityRequest = Schema.struct({
  /**
   * If set to `"*"` it corresponds to "sudo" access.
   */
  can: Schema.string(),
})

/**
 * Authorization request describing set of desired capabilities.
 */
export const AuthorizationRequest = Schema.struct({
  /**
   * DID of the Account authorization is requested from.
   */
  iss: Account,
  /**
   * Capabilities agent wishes to be granted.
   */
  att: CapabilityRequest.array(),
})

/**
 * Capability can only be delegated (but not invoked) allowing audience to
 * derived any `access/` prefixed capability for the agent identified
 * by did:key in the `with` field.
 */
export const access = capability({
  can: 'access/*',
  with: URI.match({ protocol: 'did:' }),
})

/**
 * Capability can be invoked by an agent to request set of capabilities from
 * the account.
 */
export const authorize = capability({
  can: 'access/authorize',
  with: DID.match({ method: 'key' }),
  /**
   * Authorization request describing set of desired capabilities
   */
  nb: AuthorizationRequest,
  derives: (child, parent) => {
    return (
      fail(equalWith(child, parent)) ||
      fail(equal(child.nb.iss, parent.nb.iss, 'iss')) ||
      fail(subsetCapabilities(child.nb.att, parent.nb.att)) ||
      true
    )
  },
})

/**
 * Capability is delegated by us to the user allowing them to complete the
 * authorization flow. It allows us to ensure that user clicks the link and
 * we don't have some rogue agent trying to impersonate user clicking the link
 * in order to get access to their account.
 */
export const confirm = capability({
  can: 'access/confirm',
  with: DID,
  nb: Schema.struct({
    iss: Account,
    aud: DID,
    att: CapabilityRequest.array(),
  }),
  derives: (claim, proof) => {
    return (
      fail(equalWith(claim, proof)) ||
      fail(equal(claim.nb.iss, proof.nb.iss, 'iss')) ||
      fail(equal(claim.nb.aud, proof.nb.aud, 'aud')) ||
      fail(subsetCapabilities(claim.nb.att, proof.nb.att)) ||
      true
    )
  },
})

/**
 * Issued by trusted authority (usually the one handling invocation) that attest
 * that specific UCAN delegation has been considered authentic.
 *
 * @see https://github.com/web3-storage/specs/blob/main/w3-session.md#authorization-session
 * 
 * @example
 * ```js
 * {
    iss: "did:web:web3.storage",
    aud: "did:key:z6Mkk89bC3JrVqKie71YEcc5M1SMVxuCgNx6zLZ8SYJsxALi",
    att: [{
      "with": "did:web:web3.storage",
      "can": "ucan/attest",
      "nb": {
        "proof": {
          "/": "bafyreifer23oxeyamllbmrfkkyvcqpujevuediffrpvrxmgn736f4fffui"
        }
      }
    }],
    exp: null
    sig: "..."
  }
 * ```
 */
export const session = capability({
  can: 'ucan/attest',
  // Should be web3.storage DID
  with: URI.match({ protocol: 'did:' }),
  nb: Schema.struct({
    // UCAN delegation that is being attested.
    proof: Link,
  }),
})

export const claim = capability({
  can: 'access/claim',
  with: DID.match({ method: 'key' }).or(DID.match({ method: 'mailto' })),
})

// https://github.com/web3-storage/specs/blob/main/w3-access.md#accessdelegate
export const delegate = capability({
  can: 'access/delegate',
  /**
   * Field MUST be a space DID with a storage provider. Delegation will be stored just like any other DAG stored using store/add capability.
   *
   * @see https://github.com/web3-storage/specs/blob/main/w3-access.md#delegate-with
   */
  with: DID.match({ method: 'key' }),
  nb: Schema.struct({
    // keys SHOULD be CIDs, but we won't require it in the schema
    /**
     * @type {Schema.Schema<AccessDelegateDelegations>}
     */
    delegations: Schema.dictionary({
      value: Schema.Link.match(),
    }),
  }),
  derives: (claim, proof) => {
    return (
      fail(equalWith(claim, proof)) ||
      fail(subsetsNbDelegations(claim, proof)) ||
      true
    )
  },
})

/**
 * @typedef {Schema.Dictionary<string, Types.Link<unknown, number, number, 0 | 1>>} AccessDelegateDelegations
 */

/**
 * Parsed Capability for access/delegate
 *
 * @typedef {object} ParsedAccessDelegate
 * @property {string} can
 * @property {object} nb
 * @property {AccessDelegateDelegations} [nb.delegations]
 */

/**
 * returns whether the claimed ucan is proves by the proof ucan.
 * both are access/delegate, or at least have same semantics for `nb.delegations`, which is a set of delegations.
 * checks that the claimed delegation set is equal to or less than the proven delegation set.
 * usable with {import('@ucanto/interface').Derives}.
 *
 * @param {ParsedAccessDelegate} claim
 * @param {ParsedAccessDelegate} proof
 */
function subsetsNbDelegations(claim, proof) {
  const missingProofs = setDifference(
    delegatedCids(claim),
    new Set(delegatedCids(proof))
  )
  if (missingProofs.size > 0) {
    return new Failure(
      `unauthorized nb.delegations ${[...missingProofs].join(', ')}`
    )
  }
  return true
}

/**
 * Checks that set of requested capabilities is a subset of the capabilities
 * that had been allowed by the owner or the delegate.
 *
 * ⚠️ This function does not currently check that say `store/add` is allowed
 * when say `store/*` was delegated, because it seems very unlikely that we
 * will ever encounter delegations for `access/authorize` at all.
 *
 * @param {Schema.Infer<CapabilityRequest>[]} claim
 * @param {Schema.Infer<CapabilityRequest>[]} proof
 */
const subsetCapabilities = (claim, proof) => {
  const allowed = new Set(proof.map((p) => p.can))
  // If everything is allowed, no need to check further because it contains
  // all the capabilities.
  if (allowed.has('*')) {
    return true
  }

  // Otherwise we compute delta between what is allowed and what is requested.
  const escalated = setDifference(
    claim.map((c) => c.can),
    allowed
  )

  if (escalated.size > 0) {
    return new Failure(`unauthorized nb.att.can ${[...escalated].join(', ')}`)
  }

  return true
}

/**
 * iterate delegated UCAN CIDs from an access/delegate capability.nb.delegations value.
 *
 * @param {ParsedAccessDelegate} delegate
 * @returns {Iterable<string>}
 */
function* delegatedCids(delegate) {
  for (const d of Object.values(delegate.nb.delegations || {})) {
    yield d.toString()
  }
}

/**
 * @template S
 * @param {Iterable<S>} minuend - set to subtract from
 * @param {Set<S>} subtrahend - subtracted from minuend
 */
function setDifference(minuend, subtrahend) {
  /** @type {Set<S>} */
  const difference = new Set()
  for (const e of minuend) {
    if (!subtrahend.has(e)) {
      difference.add(e)
    }
  }
  return difference
}
