# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#    |
#    v
# +-------------------------------+
# | generate_token()              |
# | * build signed LiveKit JWT    |
# +-------------------------------+
#    |
#    |----> <VideoGrants> -> __init__()
#    |        * set room join permissions
#    |
#    |----> <AccessToken> -> __init__()
#    |        * init with API key and secret
#    |
#    |----> <AccessToken> -> with_identity()
#    |        * set participant identity
#    |
#    |----> <AccessToken> -> with_name()
#    |        * set participant display name
#    |
#    |----> <AccessToken> -> with_grants()
#    |        * attach room permissions
#    |
#    |----> <AccessToken> -> to_jwt()
#    |        * sign and serialize token
#    |
#    v
# [ RETURN signed JWT string ]
#
# ================================================================

import os

LIVEKIT_URL        = os.getenv("LIVEKIT_URL",        "ws://localhost:7880")
LIVEKIT_API_KEY    = os.getenv("LIVEKIT_API_KEY",    "devkey")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "devsecret")


def generate_token(
    room_name:     str,
    identity:      str,
    name:          str  = "",
    *,
    can_publish:   bool = True,
    can_subscribe: bool = True,
) -> str:
    from livekit.api import AccessToken, VideoGrants

    grants = VideoGrants(
        room_join    = True,
        room         = room_name,
        can_publish  = can_publish,
        can_subscribe= can_subscribe,
    )

    token = (
        AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
        .with_identity(identity)
        .with_name(name or identity)
        .with_grants(grants)
        .to_jwt()
    )
    return token
