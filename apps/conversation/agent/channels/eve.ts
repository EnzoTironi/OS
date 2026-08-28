import { eveChannel } from "eve/channels/eve";
import { localDev, placeholderAuth } from "eve/channels/auth";

export default eveChannel({
  auth: [localDev(), placeholderAuth()],
});
