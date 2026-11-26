import { useMemo } from 'react';
import { DatesheetBuilder } from '../../components/domain/DatesheetBuilder';
import { Screen } from '../../components/ui/Layout';
import { AsyncBoundary } from '../../components/ui/States';
import { useResource } from '../../hooks/useResource';
import { examActions } from '../../services/actions';
import { resources } from '../../services/resources';
import { useSubjectInfo } from '../../store/subjectStore';
import { seriesOf } from '../../utils/datesheet';

const isTaught = (chapter) => chapter.status !== 'not';

/** Adds one exam (UT, half-yearly, final or any other) to the datesheet. Opened with `{ kind }`. */
export function NewDatesheetScreen({ navigation, route }) {
  const profile = useResource(resources.profile);
  const chapters = useResource(resources.allChapters);
  const exams = useResource(resources.exams);
  return (
    <Screen>
      <AsyncBoundary resource={profile}>
        {(me) => (
          <AsyncBoundary resource={chapters}>
            {(list) => <Form profile={me} chapters={list} exams={exams.data ?? []} kind={route?.params?.kind ?? 'unit'} onDone={() => navigation.goBack()} />}
          </AsyncBoundary>
        )}
      </AsyncBoundary>
    </Screen>
  );
}

function Form({ profile, chapters, exams, kind, onDone }) {
  const subjectOf = useSubjectInfo();
  const subjects = useMemo(
    () =>
      profile.subjects.map((id) => ({
        id,
        name: subjectOf(id).name,
        color: subjectOf(id).color,
        chapters: chapters.filter((chapter) => chapter.subject === id),
      })),
    [profile.subjects, chapters, subjectOf],
  );
  const existingSeries = useMemo(() => [...new Set(exams.map(seriesOf).filter(Boolean))], [exams]);
  return (
    <DatesheetBuilder
      subjects={subjects}
      today={profile.today}
      isTaught={isTaught}
      kind={kind}
      existingSeries={existingSeries}
      onSubmit={async (body) => {
        const created = await examActions.createDatesheet({
          series: body.series,
          kind: body.kind,
          papers: body.papers,
        });
        if (created) onDone();
      }}
    />
  );
}
