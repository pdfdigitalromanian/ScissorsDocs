import { Link } from 'react-router-dom'
import { APP_NAME, LOGO_URL } from '@/config/app'

export default function Brand() {
  return (
    <Link className="brand" to="/" aria-label={`${APP_NAME} home`}>
      <img
        className="brand__logo"
        src={LOGO_URL}
        alt=""
        width="24"
        height="28"
      />
      <span className="brand__name">{APP_NAME}</span>
    </Link>
  )
}
