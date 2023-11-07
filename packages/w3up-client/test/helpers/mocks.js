import * as Server from '@ucanto/server'
import { connect } from '@ucanto/client'
import * as CAR from '@ucanto/transport/car'

const notImplemented = () => {
  throw new Server.Failure('not implemented')
}

/**
 * @param {Partial<{
 * access: Partial<import('@web3-storage/w3up-client').Service['access']>
 * provider: Partial<import('@web3-storage/w3up-client').Service['provider']>
 * store: Partial<import('@web3-storage/w3up-client').Service['store']>
 * upload: Partial<import('@web3-storage/w3up-client').Service['upload']>
 * space: Partial<import('@web3-storage/w3up-client').Service['space']>
 * ucan: Partial<import('@web3-storage/w3up-client').Service['ucan']>
 * }>} impl
 */
export function mockService(impl) {
  return {
    store: {
      add: withCallCount(impl.store?.add ?? notImplemented),
      get: withCallCount(impl.store?.get ?? notImplemented),
      list: withCallCount(impl.store?.list ?? notImplemented),
      remove: withCallCount(impl.store?.remove ?? notImplemented),
    },
    upload: {
      add: withCallCount(impl.upload?.add ?? notImplemented),
      get: withCallCount(impl.upload?.get ?? notImplemented),
      list: withCallCount(impl.upload?.list ?? notImplemented),
      remove: withCallCount(impl.upload?.remove ?? notImplemented),
    },
    space: {
      info: withCallCount(impl.space?.info ?? notImplemented),
    },
    access: {
      claim: withCallCount(impl.access?.claim ?? notImplemented),
      authorize: withCallCount(impl.access?.authorize ?? notImplemented),
      delegate: withCallCount(impl.access?.delegate ?? notImplemented),
    },
    provider: {
      add: withCallCount(impl.provider?.add ?? notImplemented),
    },
    ucan: {
      revoke: withCallCount(impl.ucan?.revoke ?? notImplemented),
    },
  }
}

/**
 * @template {Function} T
 * @param {T} fn
 */
function withCallCount(fn) {
  /** @param {T extends (...args: infer A) => any ? A : never} args */
  const countedFn = (...args) => {
    countedFn.called = true
    countedFn.callCount++
    return fn(...args)
  }
  countedFn.called = false
  countedFn.callCount = 0
  return countedFn
}

/**
 * @template {string} K
 * @template {Record<K, any>} Service - describes methods exposed via ucanto server
 * @param {import('@ucanto/interface').ServerView<Service>} server
 */
export async function mockServiceConf(server) {
  const connection = connect({
    id: server.id,
    codec: CAR.outbound,
    channel: server,
  })
  return { access: connection, upload: connection }
}
