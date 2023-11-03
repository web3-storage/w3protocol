import * as ED25519 from '@ucanto/principal/ed25519'
import { delegate, Schema, UCAN } from '@ucanto/core'
import * as BIP39 from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import * as API from './types.js'
import * as Access from './access.js'

/**
 * @typedef {object} Model
 * @property {ED25519.EdSigner} signer
 * @property {string} name
 */

/**
 * Generates a new space.
 *
 * @param {object} options
 * @param {string} options.name
 */
export const generate = async ({ name }) => {
  const { signer } = await ED25519.generate()

  return new OwnedSpace({ signer, name })
}

/**
 * Recovers space from the mnemonic.
 *
 * @param {string} mnemonic
 * @param {object} options
 * @param {string} options.name
 */
export const fromMnemonic = async (mnemonic, { name }) => {
  const secret = BIP39.mnemonicToEntropy(mnemonic, wordlist)
  const signer = await ED25519.derive(secret)
  return new OwnedSpace({ signer, name })
}

/**
 * @param {object} space
 * @param {ED25519.EdSigner} space.signer
 */
export const toMnemonic = ({ signer }) => {
  /** @type {Uint8Array} */
  // @ts-expect-error - Field is defined but not in the interface
  const secret = signer.secret

  return BIP39.entropyToMnemonic(secret, wordlist)
}

/**
 * Creates a (UCAN) delegation that gives full access to the space to the
 * specified `account`. At the moment we only allow `did:mailto` principal
 * to be used as an `account`.
 *
 * @param {Model} space
 * @param {API.AccountDID} account
 */
export const createRecovery = async ({ signer, name }, account) => {
  return await delegate({
    issuer: signer,
    audience: signer.withDID(account),
    capabilities: [{ with: signer.did(), can: '*' }],
    expiration: Infinity,
    facts: [{ space: { name } }],
  })
}

// Default authorization session is valid for 1 year
export const SESSION_LIFETIME = 60 * 60 * 24 * 365
/**
 * Creates (UCAN) delegation that gives specified `agent` an access to
 * specified ability (passed as `access.can` field) on the this space.
 * Optionally, you can specify `access.expiration` field to set the
 *
 * @param {Model} space
 * @param {object} options
 * @param {API.Principal} options.agent
 * @param {API.Access} [options.access]
 * @param {API.UCAN.UTCUnixTimestamp} [options.expiration]
 */
export const createAuthorization = async (
  { signer, name },
  {
    agent,
    access = Access.spaceAccess,
    expiration = UCAN.now() + SESSION_LIFETIME,
  }
) => {
  return await delegate({
    issuer: signer,
    audience: agent,
    capabilities: toCapabilities({
      [signer.did()]: access,
    }),
    ...(expiration ? { expiration } : {}),
    facts: [{ space: { name } }],
  })
}

/**
 * @param {Record<API.Resource, API.Access>} allow
 * @returns {API.Capabilities}
 */
const toCapabilities = (allow) => {
  const capabilities = []
  for (const [subject, access] of Object.entries(allow)) {
    const entries = /** @type {[API.Ability, API.Unit][]} */ (
      Object.entries(access)
    )

    for (const [can, details] of entries) {
      if (details) {
        capabilities.push({ can, with: subject })
      }
    }
  }

  return /** @type {API.Capabilities} */ (capabilities)
}

class OwnedSpace {
  /**
   * @param {object} input
   * @param {ED25519.EdSigner} input.signer
   * @param {string} input.name
   */
  constructor({ signer, name }) {
    this.signer = signer
    this.name = name
  }

  did() {
    return this.signer.did()
  }

  /**
   *
   * @param {string} name
   */
  withName(name) {
    return new OwnedSpace({ signer: this.signer, name })
  }

  /**
   * Creates a (UCAN) delegation that gives full access to the space to the
   * specified `account`. At the moment we only allow `did:mailto` principal
   * to be used as an `account`.
   *
   * @param {API.AccountDID} account
   */
  async createRecovery(account) {
    return createRecovery(this, account)
  }

  /**
   * Creates (UCAN) delegation that gives specified `agent` an access to
   * specified ability (passed as `access.can` field) on the this space.
   * Optionally, you can specify `access.expiration` field to set the
   *
   * @param {API.Principal} agent
   * @param {object} [input]
   * @param {API.Access} [input.access]
   * @param {API.UCAN.UTCUnixTimestamp} [input.expiration]
   */
  createAuthorization(agent, input) {
    return createAuthorization(this, { ...input, agent })
  }

  /**
   * Derives BIP39 mnemonic that can be used to recover the space.
   *
   * @returns {string}
   */
  toMnemonic() {
    return toMnemonic(this)
  }
}

const SpaceDID = Schema.did({ method: 'key' })

/**
 *
 * @param {API.Delegation} delegation
 */
export const fromDelegation = (delegation) => {
  const result = SpaceDID.read(delegation.capabilities[0].with)
  if (result.error) {
    throw Object.assign(
      new Error(
        `Invalid delegation, expected capabilities[0].with to be DID, ${result.error}`
      ),
      {
        cause: result.error,
      }
    )
  }

  /** @type {{name?:string}} */
  const meta = delegation.facts[0]?.space ?? {}

  return new SharedSpace({ id: result.ok, delegation, meta })
}

class SharedSpace {
  /**
   * @param {object} input
   * @param {API.SpaceDID} input.id
   * @param {API.Delegation} input.delegation
   * @param {{name?:string}} input.meta
   */
  constructor({ id, delegation, meta }) {
    this.delegation = delegation
    this.id = id
    this.meta = meta
  }

  get name() {
    return this.meta.name ?? ''
  }

  /**
   * @param {string} name
   */
  withName(name) {
    return new SharedSpace({
      id: this.id,
      delegation: this.delegation,
      meta: { ...this.meta, name },
    })
  }

  did() {
    return this.id
  }
}