import { useState } from "react";
import { TagEditor } from "fl-manager-ui";

export const WithSuggestions = () => {
  const [tags, setTags] = useState(["dark", "drill"]);
  return (
    <div style={{ width: 360 }}>
      <TagEditor tags={tags} suggestions={["summer", "club", "drill", "sad", "feature"]} onChange={setTags} />
    </div>
  );
};

export const Empty = () => {
  const [tags, setTags] = useState<string[]>([]);
  return (
    <div style={{ width: 360 }}>
      <TagEditor tags={tags} suggestions={["dark", "summer", "club"]} onChange={setTags} />
    </div>
  );
};
