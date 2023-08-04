import * as Server from '@ucanto/server'
import * as Client from '@ucanto/client'
import * as CAR from '@ucanto/transport/car'
import { Filecoin as FilecoinCapabilities } from '@web3-storage/capabilities'

import * as API from './types.js'
import { QueueOperationFailed, StoreOperationFailed } from './errors.js'

/**
 * @param {API.Input<FilecoinCapabilities.filecoinAdd>} input
 * @param {API.StorefrontServiceContext} context
 * @returns {Promise<API.UcantoInterface.Result<API.FilecoinAddSuccess, API.FilecoinAddFailure> | API.UcantoInterface.JoinBuilder<API.FilecoinAddSuccess>>}
 */
export const claim = async ({ capability }, context) => {
  // TODO: source
  const { piece, content } = capability.nb

  // Check if self signed to call queue handler
  if (context.id.did() === capability.with) {
    return queueHandler(piece, content, context)
  }

  // TODO: queue verify

  return queueAdd(piece, content, context)
}

/**
 * @param {import('@web3-storage/data-segment').PieceLink} piece
 * @param {import('multiformats').UnknownLink} content
 * @param {API.StorefrontServiceContext} context
 * @returns {Promise<API.UcantoInterface.Result<API.FilecoinAddSuccess, API.FilecoinAddFailure> | API.UcantoInterface.JoinBuilder<API.FilecoinAddSuccess>>}
 */
async function queueAdd(piece, content, context) {
  const queued = await context.addQueue.add({
    piece,
    content,
    insertedAt: Date.now(),
  })
  if (queued.error) {
    return {
      error: new QueueOperationFailed(queued.error.message),
    }
  }

  // Create effect for receipt
  const fx = await FilecoinCapabilities.filecoinAdd
    .invoke({
      issuer: context.id,
      audience: context.id,
      with: context.id.did(),
      nb: {
        piece,
        content,
      },
    })
    .delegate()

  return Server.ok({
    status: /** @type {API.QUEUE_STATUS} */ ('queued'),
    piece,
  }).join(fx.link())
}

/**
 * @param {import('@web3-storage/data-segment').PieceLink} piece
 * @param {import('multiformats').UnknownLink} content
 * @param {API.StorefrontServiceContext} context
 * @returns {Promise<API.UcantoInterface.Result<API.FilecoinAddSuccess, API.FilecoinAddFailure> | API.UcantoInterface.JoinBuilder<API.FilecoinAddSuccess>>}
 */
async function queueHandler(piece, content, context) {
  // store piece
  const put = await context.pieceStore.put({
    content,
    piece,
    insertedAt: Date.now(),
  })
  if (put.error) {
    return {
      error: new StoreOperationFailed(put.error.message),
    }
  }

  return {
    ok: {
      status: 'accepted',
      piece,
    },
  }
}

/**
 * @param {API.StorefrontServiceContext} context
 */
export function createService(context) {
  return {
    filecoin: {
      add: Server.provideAdvanced({
        capability: FilecoinCapabilities.filecoinAdd,
        handler: (input) => claim(input, context),
      }),
    },
  }
}

/**
 * @param {API.UcantoServerContext & API.StorefrontServiceContext} context
 */
export const createServer = (context) =>
  Server.create({
    id: context.id,
    codec: context.codec || CAR.inbound,
    service: createService(context),
    catch: (error) => context.errorReporter.catch(error),
  })

/**
 * @param {object} options
 * @param {API.UcantoInterface.Principal} options.id
 * @param {API.UcantoInterface.Transport.Channel<API.StorefrontService>} options.channel
 * @param {API.UcantoInterface.OutboundCodec} [options.codec]
 */
export const connect = ({ id, channel, codec = CAR.outbound }) =>
  Client.connect({
    id,
    channel,
    codec,
  })