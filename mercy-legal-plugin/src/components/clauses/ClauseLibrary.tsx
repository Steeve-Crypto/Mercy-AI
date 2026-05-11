import { useMemo, useState } from "react";
import { Button, Card, Input, Text } from "@fluentui/react-components";
import { Add24Regular, Search24Regular } from "@fluentui/react-icons";
import { Clause } from "../../types";
import { dcClauseLibrary } from "../../utils/clauses";
import "./ClauseLibrary.css";

interface ClauseLibraryProps {
  onInsertClause: (clause: Clause) => Promise<void>;
}

export function ClauseLibrary({ onInsertClause }: ClauseLibraryProps) {
  const [query, setQuery] = useState("");

  const filteredClauses = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return dcClauseLibrary;
    }

    return dcClauseLibrary.filter((clause) =>
      [clause.title, clause.category, clause.jurisdictionNote, clause.text].some((value) => value.toLowerCase().includes(normalized))
    );
  }, [query]);

  return (
    <section className="stack">
      <Input
        contentBefore={<Search24Regular />}
        placeholder="Search DC clause library"
        value={query}
        onChange={(_, data) => setQuery(data.value)}
      />
      {filteredClauses.map((clause) => (
        <Card key={clause.id} className="clauseCard">
          <div>
            <Text weight="semibold">{clause.title}</Text>
            <Text className="clauseMeta">{clause.category}</Text>
          </div>
          <Text className="muted">{clause.jurisdictionNote}</Text>
          <Text className="clausePreview">{clause.text}</Text>
          <Button appearance="secondary" icon={<Add24Regular />} onClick={() => onInsertClause(clause)}>
            Insert
          </Button>
        </Card>
      ))}
    </section>
  );
}
