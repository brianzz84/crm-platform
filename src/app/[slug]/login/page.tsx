import { redirect } from 'next/navigation'

export default function TenantLoginRedirect({ params }: { params: { slug: string } }) {
  redirect(`/login?from=/${params.slug}/dashboard`)
}
