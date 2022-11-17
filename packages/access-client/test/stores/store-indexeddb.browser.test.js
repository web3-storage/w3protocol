import assert from 'assert'
import { StoreIndexedDB } from '../../src/stores/store-indexeddb.js'

describe('IndexedDB store', () => {
  it('should create and load data', async () => {
    const store = await StoreIndexedDB.create('test-access-db-' + Date.now())
    const data = await store.load()
    assert(data)

    // principal private key is not extractable
    const archive = data.principal.toArchive()
    assert(!(archive instanceof Uint8Array))
    assert(archive.key instanceof CryptoKey)
    assert.equal(archive.key.extractable, false)

    // no accounts or delegations yet
    assert.equal(data.spaces.size, 0)
    assert.equal(data.delegations.size, 0)

    // default meta
    assert.equal(data.meta.name, 'agent')
    assert.equal(data.meta.type, 'device')
  })

  it('should check existence', async () => {
    const store = new StoreIndexedDB('test-access-db-' + Date.now())
    await store.open()

    let exists = await store.exists()
    assert.equal(exists, false)

    await store.init({})

    exists = await store.exists()
    assert(exists)
  })

  it('should close and disallow usage', async () => {
    const store = await StoreIndexedDB.create('test-access-db-' + Date.now())
    const data = await store.load()

    await store.close()

    // should all fail
    await assert.rejects(store.init({}), { message: 'Store is not open' })
    await assert.rejects(store.save(data), { message: 'Store is not open' })
    await assert.rejects(store.exists(), { message: 'Store is not open' })
    await assert.rejects(store.close(), { message: 'Store is not open' })
  })
})
