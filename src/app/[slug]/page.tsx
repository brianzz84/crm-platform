import { redirect } from 'next/navigation'

export default function TenantRoot({ params }: { params: { slug: string } }) {
  redirect(`/${params.slug}/dashboard`)
}
