import {UPnP} from '@maks11060/ts-net'
import {logAction} from './logger.ts'

function truthy(v: string | undefined): boolean {
  if (!v) return false
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())
}

/**
 * Если USE_UPNP включён — пробрасывает PORT (и опционально внешний порт) через UPnP.
 * Возвращает cleanup для удаления mapping при остановке.
 */
export async function setupUpnp(localPort: number): Promise<(() => Promise<void>) | null> {
  if (!truthy(process.env.USE_UPNP)) {
    return null
  }

  const remotePort = Number(process.env.UPNP_EXTERNAL_PORT) || localPort
  const leaseDuration = Number(process.env.UPNP_LEASE_DURATION ?? '0')
  const description = process.env.UPNP_DESCRIPTION || 'project-mcp'

  const upnp = new UPnP({description})

  try {
    const externalIp = await upnp.getExternalIp()
    await logAction('system', 'upnp_external_ip', {externalIp})

    await upnp.addPortMapping({
      remotePort,
      localPort,
      transport: 'tcp',
      leaseDuration,
      description,
    })

    await logAction('system', 'upnp_mapped', {remotePort, localPort, description})
    console.log(`[upnp] mapped ${externalIp}:${remotePort} → local:${localPort} (${description})`)
  } catch (err) {
    console.error('[upnp] failed to add port mapping:', err)
    await logAction('system', 'upnp_error', {
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }

  return async () => {
    try {
      await upnp.deletePortMapping({remotePort, transport: 'tcp'})
      console.log(`[upnp] removed mapping :${remotePort}`)
      await logAction('system', 'upnp_unmapped', {remotePort})
    } catch (err) {
      console.error('[upnp] failed to delete port mapping:', err)
    }
  }
}
