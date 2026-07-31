import type { AnimationRecord } from '../../shared/character';
import { videoModelName } from '../../shared/video-models';
import { Report, ReportRow } from './PanelParts';

/**
 * What was made, and what was fixed.
 *
 * Written in measurements rather than verdicts, so approving is a judgement
 * about the art and not about the machinery. The repairs are declared here
 * because the run does not stop to ask permission for each one (D5).
 */

export function AnimationReportRows({
  animation,
  paletteSize,
}: {
  animation: AnimationRecord;
  paletteSize: number;
}) {
  const report = animation.report;
  if (report === null) return null;
  const frameCount = animation.frames.length;

  return (
    <Report>
      <ReportRow
        check="Palette"
        found={`every frame on the character's ${paletteSize} colours`}
        note={`worst frame ${(report.offPalette * 100).toFixed(1)}% off`}
        tone={report.offPalette > 0.02 ? 'warn' : 'pass'}
      />
      <ReportRow
        check="Root"
        found={`${report.drift} px drift · ${report.grounded} of ${frameCount} grounded`}
        note={
          report.uncorrected
            ? 'nothing touched the ground, so no drift correction was applied'
            : 'measured at best alignment'
        }
        tone={report.uncorrected ? 'warn' : report.drift === 0 ? 'pass' : 'warn'}
      />
      <ReportRow
        check="Stillness"
        found={
          report.churn === 0
            ? 'no churn in the still regions'
            : `${(report.churn * 100).toFixed(1)}% churn where nothing happens`
        }
        note={`${(report.churnWithoutMemory * 100).toFixed(1)}% without memory`}
        tone={report.churn === 0 ? 'pass' : 'warn'}
      />
      <ReportRow
        check="Body size"
        found={`within ${report.heightSpread} px of the character`}
        tone={report.heightSpread <= 2 ? 'pass' : 'warn'}
      />
      <ReportRow
        check="Feet travelled"
        found={`${report.footTravel} px`}
        note="zero for an animation that stands still"
        tone="pass"
      />
      {report.loopClosure !== null && (
        <ReportRow
          check="Loop closure"
          found={`${report.loopClosure} px from the first frame`}
          note={
            report.loopCandidate === null
              ? 'no cycle was found in the clip'
              : `best cycle: frames ${report.loopCandidate.start + 1}–${report.loopCandidate.end + 1}`
          }
          tone={report.loopClosure === 0 ? 'pass' : 'warn'}
        />
      )}
      {animation.findings.map((finding) => (
        <ReportRow
          key={`${finding.check}:${finding.message}`}
          check={finding.check}
          found={finding.message}
          tone={finding.level === 'refuse' ? 'fail' : 'warn'}
        />
      ))}
      {report.repairedFrames.length > 0 && (
        <ReportRow
          check="Repairs"
          found={`frame${report.repairedFrames.length === 1 ? '' : 's'} ${report.repairedFrames
            .map((at) => at + 1)
            .join(', ')} redrawn`}
          note="repaired without stopping, and declared here"
          tone="warn"
        />
      )}
      <ReportRow
        check="Made from"
        found={`${report.sampledFrames} frames sampled · ${report.keptFrames} kept`}
        note={
          animation.videoModel === undefined
            ? undefined
            : `${videoModelName(animation.videoModel)} · one call`
        }
        tone="pass"
      />
    </Report>
  );
}
