import assert from 'assert'
import * as configModule from '../src/config.js'

/** keypair that can be used for testing */
const testKeypair = {
  private: {
    /**
     * Private key encoded as multiformats
     */
    multiformats:
      'MgCYWjE6vp0cn3amPan2xPO+f6EZ3I+KwuN1w2vx57vpJ9O0Bn4ci4jn8itwc121ujm7lDHkCW24LuKfZwIdmsifVysY=',
  },
  public: {
    /**
     * Public key encoded as a did:key
     */
    did: 'did:key:z6MkqBzPG7oNu7At8fktasQuS7QR7Tj7CujaijPMAgzdmAxD',
  },
}

describe('@web3-storage/access-api/src/config configureSigner', () => {
  it('creates a signer using config.{DID,PRIVATE_KEY}', async () => {
    const config = {
      PRIVATE_KEY: testKeypair.private.multiformats,
      DID: testKeypair.public.did,
    }
    const signer = configModule.configureSigner(config)
    assert.ok(signer)
    assert.equal(signer.did().toString(), config.DID)
  })
  it('errors if config.DID is provided but not a did', () => {
    assert.throws(() => {
      configModule.configureSigner({
        DID: 'not a did',
        PRIVATE_KEY: testKeypair.private.multiformats,
      })
    }, 'Invalid DID')
  })
  it('infers did from config.PRIVATE_KEY when config.DID is omitted', async () => {
    const config = {
      PRIVATE_KEY: testKeypair.private.multiformats,
    }
    const signer = configModule.configureSigner(config)
    assert.ok(signer)
    assert.equal(signer.did().toString(), testKeypair.public.did)
  })
})
