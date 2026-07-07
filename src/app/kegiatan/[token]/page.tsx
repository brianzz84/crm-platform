import { notFound } from 'next/navigation'
import CheckinClient from './_CheckinClient'

type Props = { params: { token: string } }

export default async function CheckinPage({ params }: Props) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const res = await fetch(`${baseUrl}/api/kegiatan/${params.token}`, {
    cache: 'no-store',
  })

  if (!res.ok) notFound()

  const data = await res.json()

  return <CheckinClient data={data} token={params.token} />
}
