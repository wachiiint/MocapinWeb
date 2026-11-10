// Source: professor's draft temp/draft.pdf (Nov 9, 2026), framed for the next CVPR cycle or an IEEE/CVF medical-vision workshop.
// Results cells in Section 4 are left blank on purpose; Section 5 states expected conclusions.
// 
// [Anti-Slop: 20% - @wachi - SLOP ENTIRE PAPER]
#import "preambles.typ": paper
#import "diagrams.typ": arch-diagram

#show: paper.with(
  title: "MRI-to-Motion: A Standards-Aligned Pipeline for Video-Based Assessment of Age-Related Muscle Weakness",
  authors: (
    "Wachiraphut Intarachart",
    "Puntawit Masun",
    "Kittichon Chaonawig",
    "Kantinun Sucharitkul",
    "Pizzanu Kanongchaiyos",
  ),
  affiliation: "Department of Computer Engineering, Chulalongkorn University, Bangkok, Thailand",
  abstract: [
    Age-related muscle weakness and sarcopenia are assessed through muscle strength, muscle quantity and physical performance, yet performance is still judged largely by a clinician watching the patient move, in person or on video. Visual gait assessment has poor-to-moderate inter-rater reliability, and the people who act on it (physicians, physiotherapists, radiologists, dietitians, caregivers and the older patient) each see only one fragment of the evidence. Machine-learning components for each fragment now exist: individual-muscle MRI segmentation, MRI biomarkers of strength, monocular video-to-biomechanics, and human motion forecasting. No published system integrates them into one pipeline whose outputs are defined, validated and reported against clinical standards.

    We propose MRI-to-Motion (M2M), a standards-aligned architecture that (i) segments individual lower-limb muscles and intramuscular fat from MRI, (ii) converts them into a subject-specific musculoskeletal capacity model, (iii) recovers 3D kinematics and muscle-driven dynamics from two calibrated smartphone videos, or one at lower accuracy, of standard clinical tests (gait, chair-stand, Timed Up-and-Go), (iv) in a proposed extension, forecasts near-term motion and functional decline conditioned on the capacity model, and (v) maps every output onto clinical endpoints: AWGS 2025 and EWGSOP2 criteria, Short Physical Performance Battery (SPPB) items and minimal clinically important differences. The architecture is specified with IEEE 1016 design viewpoints, and the evaluation protocol follows TRIPOD+AI, STARD and DECIDE-AI. We describe a three-cohort experimental design with baselines, ablations and agreement statistics. We expect that MRI-derived capacity will reduce kinematic and functional-endpoint error relative to video-only models, and that the pipeline will reach clinically acceptable agreement (ICC ≥ 0.90 for timed endpoints) with instrumented reference measures.
  ],
  keywords: (
    "sarcopenia", "muscle weakness", "older adults", "MRI muscle segmentation",
    "musculoskeletal modeling", "multi-view 3D human pose", "motion forecasting",
    "clinical decision support", "IEEE 1016", "TRIPOD+AI",
  ),
)

= Introduction <sec-intro>

== Clinical context
Sarcopenia is now defined as a muscle disease in which low strength is the primary signal, low muscle quantity or quality confirms the diagnosis, and poor physical performance marks severity [1]. The Asian Working Group for Sarcopenia (AWGS 2025) operationalises this for Asian populations and shifts the focus from sarcopenia to muscle health [2]. Diagnosis now rests on low muscle strength (handgrip) and low muscle mass; physical performance (gait speed, five-time chair-stand, SPPB) is no longer a diagnostic criterion but an outcome to be tracked over time [2]. Performance is therefore where repeated, objective measurement matters most.

The burden is acute in Thailand. The 2024 national survey counted about 14 million people aged 60 or over, 20% of the population, making Thailand a "complete aged society" [3]. Gait speed matters at this scale because a decline of 0.1 m/s or 1 SPPB point within one year predicts higher five-year mortality [6], and gait speed itself stratifies survival in older adults [9].

== The pain point: motion is judged by eye
Strength and mass have instruments (dynamometer, DXA, MRI). Performance, the outcome that tracks change, is still read largely by observation: a clinician times a walk, watches a sit-to-stand, or reviews a phone video. Observational gait analysis is fast and cheap, but its reliability is poor to moderate: in a 2025 study of 20 physiotherapists, inter-rater ICC for visually estimated joint angles ranged from 0.04 to 0.59, and agreement with video-measured reference angles was limited [4]. A stopwatch captures gait speed but not why the patient is slow. Weak hip abductors, quadriceps fat infiltration, pain-avoidance or balance strategy each look different in the kinematics and call for different interventions.

The structural side has the opposite problem. MRI shows each muscle's volume and intramuscular adipose tissue (IMAT), and thigh IMAT is strongly associated with mobility function in older adults [10]. But an MRI report says nothing about how that muscle behaves during a chair rise, and it is rarely connected to the motion assessment done in another room by another professional.

== Every stakeholder sees one fragment
The diagnostic and care pathway spans at least six roles. Each holds a different piece of evidence, uses a different vocabulary and has no shared quantitative view of the patient (@tab-stakeholders).

#figure(
  table(
    columns: (1fr, 1fr, 1.2fr, 1.2fr),
    [Stakeholder], [Decision they make], [Current limitation], [What M2M must supply],
    [Geriatrician / physician], [Diagnose sarcopenia, grade severity, refer], [Performance graded by eye or stopwatch; no link to muscle structure], [Per-criterion AWGS/EWGSOP2 evidence with uncertainty; the physician assigns the class],
    [Physiotherapist / rehab therapist], [Target muscles, prescribe exercise], [Visual gait analysis inter-rater ICC 0.04--0.59 [4]], [Joint angles, moments and per-muscle demand-to-capacity ratio],
    [Radiologist], [Report muscle volume and fat], [Manual segmentation is slow; report has no functional meaning], [Automated per-muscle volume, fat fraction, IMAT with QC flags],
    [Research assistant / technician], [Run tests, record data], [Paper forms, unsynchronised video, inconsistent protocols], [Guided capture app, automatic test segmentation, data validation],
    [Dietitian / nutritionist], [Set protein and energy targets], [Sees body weight, not muscle-specific change], [Longitudinal muscle-quality trend linked to intake periods],
    [Older patient and caregiver], [Adhere to exercise, understand risk], [Results are abstract numbers; home monitoring impossible], [Plain-language risk view and a home video re-test],
    [Hospital / regulator], [Adopt and audit the tool], [ML outputs not mapped to clinical endpoints or standards], [Traceable outputs, TRIPOD+AI reporting, IEC 62304 lifecycle],
  ),
  caption: [Stakeholder pain points and what an integrated pipeline must supply],
) <tab-stakeholders>

== The research gap
The components needed to close these gaps exist, but in separate literatures. Deep networks segment individual lower-limb muscles from MRI with Dice 0.89--0.95 [13], [14]. MRI biomarkers predict knee-extension torque [11]. Monocular video now yields musculoskeletal kinematics and dynamics [29]--[31], and video--EMG datasets link motion to muscle activation [33]. Motion forecasting from RGB is an established vision task [40].

What is missing is integration. No published system carries a patient-specific, MRI-derived muscle-capacity model through video-based motion analysis into clinically defined endpoints. MRI-personalised musculoskeletal models are still evaluated with marker-based motion capture rather than ordinary video [22], and video-based forecasters have no representation of individual muscle capacity [40]. Equally important, existing systems report pose error in millimetres or degrees, not agreement with AWGS criteria, SPPB items or minimal clinically important differences (MCID). There is no reference architecture that tells a clinical team which module produces which clinical quantity, with what uncertainty, under which standard.

== Contributions
This paper makes four contributions:
+ A reference architecture (M2M) for the MRI-to-motion pipeline, specified with IEEE 1016 design viewpoints, that links seven modules from DICOM ingestion to stakeholder reports through explicit data contracts.
+ A capacity-conditioned motion model that injects MRI-derived per-muscle maximum isometric force, corrected for fat and pennation, and moment-arm geometry into two-camera 3D kinematics (with a one-camera monocular mode) and muscle-driven dynamics, and, as a proposed extension, short-horizon forecasting.
+ A clinical metric layer that converts every model output into AWGS 2025 / EWGSOP2 criteria, SPPB sub-scores and MCID-referenced change, each with a calibrated uncertainty.
+ A standards-aligned evaluation protocol that other groups can reuse: three cohorts, baselines, ablations and agreement statistics reported under TRIPOD+AI, STARD and DECIDE-AI.

@sec-related reviews related work. @sec-arch presents the architecture. @sec-exp details the experimental design, with results to be reported. @sec-conclusion states the expected conclusions.

= Related Work <sec-related>
We group prior work into five strands. Each delivers one link of the MRI-to-motion chain; none delivers the chain.

== Clinical assessment of age-related weakness
EWGSOP2 [1] and AWGS 2025 [2] define the diagnostic algorithm; SPPB [7] and the Timed Up-and-Go (TUG) [8] are the standard performance batteries. Meaningful individual change is about 0.05 m/s (small) and 0.10 m/s (substantial) for gait speed, and 0.5 and 1.0 points for SPPB [5]. These thresholds are the natural accuracy targets for any automated system, yet vision papers rarely report against them. Observational assessment remains the norm, with inter-rater reliability too low for longitudinal tracking [4].

== MRI segmentation of individual muscles
Cascaded 3D CNNs segment 35 lower-limb muscles, 14 of them within inter-observer variability [13]. Supervised networks reach Dice 0.89--0.95 on thigh and leg muscles [14]. SegmentAnyMuscle generalises across anatomical sites with Dice 88.45% [15]. Self-configuring nnU-Net [16] underlies TotalSegmentator MRI, which segments 80 structures across sequences with Dice 0.839 on its internal test set [17]. Performance drops in older and post-menopausal cohorts, where Dice of 0.70--0.84 has been reported [18], and annotation cost motivates few-slice label propagation [19]. Segmentation alone yields geometry, not function.

== From anatomy to muscle capacity
Image-based musculoskeletal modelling combines geometry, architecture and constitutive laws to represent force generation [20]. Lean cross-sectional area is the strongest single MRI predictor of knee-extension torque, and diffusion and fascicle-length measures add to it in some contraction modes [11]; statistical shape models improve on volume for selected quadriceps muscles [12]. Thigh IMAT relates to mobility independently of lean mass [10]. OpenSim [25], [26] is the open-source standard for musculoskeletal simulation: it scales a generic model to a subject and solves inverse kinematics and dynamics. Automated pipelines can turn segmented surfaces into muscle lines of action for OpenSim-class models [21], [25], [26]. MRI-personalised models change estimated joint loads even when kinematics look similar [22], so plausible motion does not imply correct internal forces. Direct MRI recovery of muscle stiffness has so far been shown only in a motion phantom [24].

== Video-based motion and biomechanics
Parametric body models such as SMPL [27] and world-grounded video methods such as WHAM [41] recover 3D human motion from RGB. Pose2Sim [51] triangulates 2D keypoints from several calibrated cameras into 3D markers and passes them to OpenSim for scaling and inverse kinematics, giving a low-cost multi-camera route to biomechanics. OpenCap derives kinematics and muscle-driven dynamics from two or more smartphones [28]; OpenCap Monocular reduces this to one video with 4.8° mean rotational error [29]. BioPose adds anatomical constraints to monocular pose [30], MonoMSK couples inverse and differentiable forward dynamics [31], and BioHuman jointly predicts motion and activations [32]. Muscles in Action pairs 12.5 h of video with surface EMG for eight muscles [33]; MuscleMap labels activated muscle groups in 15,000 clips [34]. Several of these methods supervise muscle quantities with simulation-derived labels [35], [36], so agreement with labels is not agreement with physiology. Single-camera muscle-force models remain proof-of-concept studies in small cohorts [37], [38]. A 2025 clinical benchmark found large depth errors across monocular estimators [39], which would propagate into any downstream biomechanics. HumanScore [52] makes a related point for generated video: its kinematic, temporal and biomechanical metrics show that visually realistic motion can still be physically implausible.

== Motion forecasting
PoseMoNet estimates 3D pose and forecasts future motion from 2D image sequences [40]. Forecasters of this kind learn population motion priors; none conditions on an individual's measured muscle capacity, so they cannot predict how a specific patient's chair rise will degrade as quadriceps fat fraction rises.

== Gap analysis
@tab-gap summarises coverage. The empty cells are the contribution space of M2M: no prior work links individual MRI geometry and capacity to video-observed motion and reports the result in clinical endpoints. Forecasting under that capacity is proposed here as an extension.

#figure(
  table(
    columns: (1.6fr, 1fr, 1fr, 1fr, 1fr, 1fr, 1.1fr),
    align: (left, center, center, center, center, center, center),
    [Work], [Per-muscle MRI geometry], [MRI capacity / strength], [Video kinematics], [Muscle dynamics], [Future motion], [Clinical endpoints (AWGS / SPPB / MCID)],
    [Muscle segmentation [13]--[17]], [✓], [-], [-], [-], [-], [-],
    [MRI strength biomarkers [11], [12]], [○], [✓], [-], [-], [-], [○],
    [MRI-personalised MSK models [21], [22]], [✓], [○], [- (marker mocap)], [✓], [-], [-],
    [Pose2Sim + OpenSim [51], [26]], [-], [-], [○ (multi-camera)], [○], [-], [-],
    [OpenCap / OpenCap Monocular [28], [29]], [-], [-], [✓], [✓], [-], [○],
    [BioPose, MonoMSK, BioHuman [30]--[32]], [-], [-], [✓], [○], [-], [-],
    [Muscles in Action, MuscleMap [33], [34]], [-], [-], [✓], [○ (EMG / labels)], [○], [-],
    [PoseMoNet [40]], [-], [-], [✓], [-], [✓], [-],
    [*M2M (this work)*], [✓], [✓], [✓], [✓], [○ (proposed)], [✓],
  ),
  caption: [Coverage of the MRI-to-motion chain in prior work (✓ covered, ○ partial, - absent)],
) <tab-gap>

== Reporting and engineering standards
TRIPOD+AI gives a 27-item checklist for prediction models built with regression or machine learning and supersedes TRIPOD 2015 [42]. STARD 2015 covers diagnostic accuracy [43], DECIDE-AI covers early clinical evaluation of AI decision support [44], and COSMIN covers measurement properties [50]. Agreement is assessed with Bland--Altman limits [45] and ICC with the Koo--Li interpretation bands [46]. On the engineering side, IEEE 1016 defines software design descriptions [47], IEC 62304 the medical-software lifecycle [48] and ISO 14971 risk management [49]. M2M is designed against all of these from the outset rather than retrofitted.

= Proposed Architecture: MRI-to-Motion (M2M) <sec-arch>
M2M turns one lower-limb MRI and two calibrated smartphone videos (or one, at lower accuracy) of standard clinical tests into per-muscle capacity, observed and forecast motion, and clinical endpoints with uncertainty. It has seven modules in four layers: data, anatomy, motion and clinical (@fig-arch).

== Design description per IEEE 1016
We document the system with the IEEE 1016-2009 design viewpoints [47], so that clinicians, engineers and auditors can each find the view that answers their concern (@tab-viewpoints).

#figure(
  table(
    columns: (1fr, 2.2fr, 1.4fr),
    [Viewpoint], [Stakeholder concern], [Where specified],
    [Context], [What enters and leaves the system; who uses it], [@fig-arch boundary; @tab-stakeholders],
    [Composition], [Which modules exist and what each owns], [@sec-modules, M1--M7],
    [Logical], [Core data types: muscle record, capacity vector, motion sequence, endpoint record], [@sec-modules, @eq-fmax -- @eq-loss],
    [Dependency], [Which module needs which output; failure propagation], [@fig-arch arrows; QC gates],
    [Interface], [Formats, units and coordinate frames between modules], [@tab-interfaces],
    [Interaction], [Run-time order for a clinic visit and for a home re-test], [@sec-modules, M1 and M7],
    [State dynamics], [Patient record states: captured → QC-passed → analysed → clinician-reviewed → released], [@sec-safety],
    [Resource], [Compute budget per visit; on-premise vs. cloud], [@sec-impl],
  ),
  caption: [IEEE 1016 viewpoints used to specify M2M],
) <tab-viewpoints>

#figure(
  arch-diagram,
  caption: [M2M architecture. MRI-derived capacity (M3) scales the skeleton for M4, constrains muscle forces in M5 and conditions forecasting in the proposed M6; M7 turns every output into clinical endpoints for each stakeholder.],
) <fig-arch>

== Modules <sec-modules>
*M1: Acquisition and quality control.* MRI: bilateral hip-to-ankle 2-point or 6-point Dixon (water, fat, in/opposed phase), 1.5 T or 3 T, ≤ 1.5 mm in-plane resolution, ingested as DICOM. Video: two time-synchronised smartphones at 30--60 fps on a fixed, calibrated rig (geometry to be finalised), recording 4-m or 6-m usual-pace gait, five-time chair-stand, TUG and the SPPB balance stands; a single phone is accepted in monocular mode. During recording, a light pose model on the phone acts as a keypoint guard for framing, lighting and a single person in view; its keypoints are never stored. The app records participant height and weight for scaling. Clinical data (handgrip, DXA, diet record) arrive as HL7 FHIR resources. Every input passes an automatic QC gate (motion artefact, fat--water swap, occlusion, frame drops) before it is analysed.

*M2: Muscle segmentation and quantification.* An nnU-Net [16] initialised from TotalSegmentator MRI [17] and fine-tuned on older-adult thighs and calves segments $K = 24$ lower-limb muscles per side plus subcutaneous fat, IMAT and femur/tibia. For each muscle $m$ it outputs volume $V_m$, anatomical CSA profile, proton-density fat fraction $"FF"_m$ and IMAT volume. A five-fold ensemble provides voxel-wise uncertainty; muscles whose mean uncertainty exceeds a threshold are flagged for radiologist review rather than passed on silently.

*M3: Subject-specific capacity model.* M3 scales the Lai--Uhlrich full-body musculoskeletal model used by OpenCap [28] in OpenSim [25], [26]. When MRI is available, bone lengths from the MRI fix segment scaling, following automated geometry pipelines [21]; otherwise the OpenSim Scale tool uses height, weight and the video markers. Muscle paths give moment arms $r_m (q)$. Maximum isometric force is estimated from fat-corrected physiological CSA:
$ F_m^max = sigma_0 dot (V_m cos theta_m) / L_m^"opt" dot (1 - "FF"_m) $ <eq-fmax>
where $sigma_0 approx 60$ N/cm² is specific tension, $theta_m$ the pennation angle taken from the literature and $L^"opt"$ the optimal fibre length. Without MRI, generic $F_m^max$ values are kept. One MRI muscle label may map to several OpenSim muscles, and the supine MRI must be registered to OpenSim body frames. A learned correction $exp(g_phi (bold(z)_m))$ on the muscle's image features $bold(z)_m$ (shape, IMAT ratio, texture), calibrated against dynamometer torque [11], [12], is a planned extension. The capacity vector $bold(c) = {F_m^max, r_m, L_m^"opt"}$ and segment inertias [23] form the patient's digital musculoskeletal twin.

*M4: Motion recovery.* The main mode uses two cameras. A fine-tuned RTMPose [53] detector gives 26 body and foot keypoints (HALPE_26) per camera and frame. Pose2Sim [51] triangulates the synchronised views with the rig calibration into 3D keypoints and applies a Butterworth low-pass filter. The OpenCap LSTM marker augmenter [28] then predicts about 43 anatomical markers from these keypoints, height and weight, and OpenSim inverse kinematics on the M3 model gives joint angles. The monocular mode takes one video: a world-grounded SMPL [27] estimator (WHAM [41]) recovers 3D joints, which feed the same augmenter and inverse kinematics, as in OpenCap Monocular [29]. Its outputs are flagged as lower accuracy. Because the skeleton is MRI-scaled, bone-length ambiguity, a main source of monocular depth error [39], is reduced. Output: joint angles $q(t)$, velocities and pelvis trajectory, with per-frame confidence.

*M5: Capacity-conditioned dynamics.* No force plates are used. Given $q(t)$, M5 runs a tracking simulation with foot--ground contact spheres (opencap-processing [28]) that estimates ground reaction forces and solves muscle redundancy with the patient's capacity $bold(c)$ instead of generic values. The simulation takes minutes per trial. It computes joint moments, muscle forces $F_m (t)$ and the demand-to-capacity ratio
$ "DCR"_m (t) = (F_m (t)) / F_m^max, quad "DCR"_m^"peak" = max_t "DCR"_m (t) $ <eq-dcr>
A DCR near 1 during a chair rise identifies the muscle that limits the task, which is the quantity a physiotherapist needs to target.

*M6: Capacity-conditioned forecasting (proposed, not built in this phase).* A spatio-temporal transformer takes the observed motion $q(t <= T)$, the capacity embedding $e(bold(c))$ and the DCR profile. It predicts (a) short-horizon motion $q(T+1 ... T+H)$, $H = 1"–"2$ s, to detect imminent instability such as a failed sit-to-stand, and (b) the functional trajectory: gait speed, chair-stand time and SPPB at 6 and 12 months under a "no change" or a counterfactual "capacity +x%" scenario. The counterfactual lets a dietitian or physiotherapist see the expected functional effect of a target muscle gain.

*M7: Clinical metric and reporting layer.* M7 converts outputs into the quantities clinicians use: gait speed, five-time chair-stand time, SPPB sub-scores, TUG time, AWGS 2025 / EWGSOP2 criteria, and change since the last visit relative to MCID (0.05/0.10 m/s, 0.5/1.0 SPPB points [5]). Split-conformal prediction gives each endpoint a 90% interval, and an endpoint is reported as "indeterminate" when the interval spans a cut-off. M7 never assigns a sarcopenia class: the clinician classifies, using handgrip and muscle mass as AWGS 2025 requires. Role-specific views are produced for each stakeholder in @tab-stakeholders, and results are written back as FHIR Observations.

== Training
Each learned module is trained on its own. M2 is trained with Dice + cross-entropy. RTMPose is fine-tuned on older-adult clinical-test video with its standard keypoint loss; the marker augmenter and WHAM use published weights. M3 and M5 are physics-based and have no trained parameters. The planned correction $g_phi$ in M3 is fitted to dynamometer torque:
$ cal(L)_"torque" = 1/J sum_(j=1)^J (hat(tau)_j^max - tau_j^"dyn")^2 $ <eq-loss>
where $hat(tau)_j^max$ is the maximum torque at joint $j$ predicted by the corrected model and $tau_j^"dyn"$ the isokinetic measurement. The proposed M6 would be trained separately on forecast error.

== Interfaces, states and safety <sec-safety>
@tab-interfaces fixes the contracts between modules. Each record moves through the states captured → QC-passed → analysed → clinician-reviewed → released, and nothing reaches a patient-facing view without the reviewed state. The software is developed under IEC 62304 [48] with an ISO 14971 [49] hazard log; the top hazards are false reassurance (a missed sarcopenia case) and over-confident forecasts, mitigated by the indeterminate flag, by leaving every class to the clinician and by mandatory clinician review.

#figure(
  table(
    columns: (0.8fr, 2fr, 1.2fr, 1fr),
    [From → To], [Content], [Format], [Units / frame],
    [M1 → M2], [Dixon water/fat volumes], [DICOM / NIfTI], [mm, scanner frame],
    [M1 → M4], [Two videos (or one), rig calibration, height, weight], [MP4 + TOML + JSON], [px, fps, m, kg],
    [M2 → M3], [Per-muscle mask, $V_m$, $"FF"_m$, IMAT, uncertainty], [NIfTI + JSON], [cm³, %, MRI frame],
    [M3 → M4, M5], [Scaled Lai--Uhlrich model, moment arms, $F_m^max$], [OpenSim .osim], [m, N, body frame],
    [M4 → M5, M6], [Markers, $q(t)$, pelvis path, confidence], [.trc + .mot], [m, deg, s],
    [M5 → M6, M7], [Ground reaction forces, joint moments, $F_m (t)$, $"DCR"_m (t)$], [Parquet], [N, N·m/kg, ratio],
    [M6 → M7], [Forecast motion and endpoint trajectories with intervals], [JSON], [deg, m/s, s, points],
    [M7 → users], [Endpoints, AWGS criterion values, MCID change, views], [FHIR Observation + PDF], [clinical units],
  ),
  caption: [Interface viewpoint: data contracts between modules],
) <tab-interfaces>

= Experimental Design <sec-exp>
The experiments test whether adding MRI-derived capacity to video analysis improves clinically meaningful accuracy, and whether the full pipeline agrees with instrumented reference standards well enough for clinical use. Results are left blank pending data collection.

== Hypotheses
- *H1 (anatomy).* M2 segments older-adult lower-limb muscles with mean Dice ≥ 0.85 and volume ICC ≥ 0.90 versus expert manual segmentation.
- *H2 (capacity).* MRI-derived $F^max$ (@eq-fmax) predicts isokinetic knee-extension and hip-abduction torque better than lean CSA alone.
- *H3 (motion).* MRI-scaled kinematics reduce joint-angle error relative to generic-scaled kinematics, and two-camera kinematics reduce error relative to the monocular mode.
- *H4 (endpoints).* Video-derived gait speed, chair-stand time and SPPB agree with instrumented references within MCID, and the clinician's AWGS 2025 class, made with M2M outputs, reaches sensitivity ≥ 0.85 against the reference workup.
- *H5 (forecasting, proposed M6).* Capacity conditioning reduces 12-month functional forecast error relative to a motion-only forecaster.

== Cohorts and ethics

#figure(
  table(
    columns: (1fr, 1fr, 1.3fr, 1.8fr, 0.5fr),
    [Cohort], [Purpose], [Participants], [Measurements], [Planned n],
    [C1 Lab development], [Develop and validate M2--M5], [Adults ≥ 60 y: robust, possible sarcopenia, sarcopenia], [Dixon MRI, 10-camera marker mocap, force plates, isokinetic dynamometer, 8-channel sEMG, handgrip, DXA, two-smartphone video], [120],
    [C2 Clinical validation], [Test endpoints and clinician AWGS class with M2M (H4)], [Consecutive geriatric outpatients ≥ 60 y], [Dixon MRI, two-smartphone video in clinic, AWGS 2025 reference workup, two blinded clinician ratings], [260],
    [C3 Longitudinal], [Test forecasting (H5)], [Subset of C1 + C2; usual care or 12-week resistance exercise + protein], [Repeat video at 3, 6, 12 months; repeat MRI at 12 months], [100],
  ),
  caption: [Study cohorts],
) <tab-cohorts>

C2 is sized for diagnostic precision: with expected sensitivity 0.85, a 95% CI half-width of 0.08 needs 77 sarcopenia cases; at an assumed 30% clinic prevalence this gives $n = 260$. Final C1 and C3 sizes will be fixed by an ICC precision calculation before enrolment. The protocol requires Chulalongkorn University IRB approval and Thai PDPA-compliant consent; video is stored face-blurred and on-premise.

== Reference standards

#figure(
  table(
    columns: (1fr, 1.6fr),
    [Endpoint], [Reference standard],
    [Muscle volume, fat fraction], [Manual segmentation by two musculoskeletal radiologists],
    [Muscle strength capacity], [Isokinetic dynamometry (knee, hip), handgrip dynamometer],
    [Joint kinematics and moments], [Marker motion capture + force plates, OpenSim inverse dynamics],
    [Muscle activation timing], [Surface EMG],
    [Gait speed, chair-stand, TUG], [Instrumented walkway / timing gates; stopwatch by trained assessor],
    [SPPB], [Standard protocol scored by a blinded physiotherapist],
    [Sarcopenia class], [AWGS 2025 workup (handgrip, muscle mass by DXA)],
  ),
  caption: [Reference standard for each endpoint],
) <tab-reference>

== Baselines
- *B1 Observational rating:* two clinicians score the same videos by eye (current practice).
- *B2 Generic video-only:* monocular pipeline with generic body scaling and generic muscle parameters (OpenCap Monocular-class [29]).
- *B3 Anatomy-constrained video:* BioPose / MonoMSK-class monocular biomechanics [30], [31].
- *B4 MRI-only:* torque predicted from MRI features alone [11], and the clinician's AWGS class made with MRI outputs but no video.
- *B5 Motion-only forecaster:* PoseMoNet-class forecaster without capacity input [40].

== Ablations

#figure(
  table(
    columns: (0.4fr, 1.5fr, 2fr),
    [ID], [Removed component], [Question answered],
    [A1], [MRI skeleton scaling in M4], [Does subject-specific geometry reduce kinematic error, most of all in monocular mode?],
    [A2], [Fat-fraction term $(1 - "FF"_m)$ in @eq-fmax], [Does muscle quality matter beyond quantity?],
    [A3], [Pennation term $cos theta_m$ in @eq-fmax], [Does fibre architecture matter beyond volume?],
    [A4], [Capacity embedding $e(bold(c))$ in M6], [Does capacity improve forecasting (H5)?],
    [A5], [Conformal intervals in M7], [Effect on false reassurance near AWGS cut-offs],
    [A6], [Second camera (monocular mode)], [How much accuracy does one camera lose (H3)?],
  ),
  caption: [Ablations],
) <tab-ablations>

== Metrics aligned with medical standards
Each metric has a pre-registered acceptance threshold tied to a clinical or measurement standard, not to a leaderboard.

#figure(
  table(
    columns: (0.9fr, 1.5fr, 1.3fr, 1.2fr),
    [Level], [Metric], [Acceptance threshold], [Basis],
    [Segmentation], [Dice, HD95, volume ICC(2,1)], [Dice ≥ 0.85; ICC ≥ 0.90], [Inter-observer range [13]; Koo--Li [46]],
    [Capacity], [Pearson r and RMSE vs. dynamometer torque], [r ≥ 0.75], [Prior MRI torque models [11]],
    [Kinematics], [Joint-angle MAE, pelvis translation error], [MAE ≤ 5° sagittal], [OpenCap [28], OpenCap Monocular [29]],
    [Gait speed], [Bland--Altman bias and 95% LoA; ICC], [LoA within ±0.10 m/s; ICC ≥ 0.90], [Substantial MCID [5]; [45]],
    [Chair-stand, TUG], [Bland--Altman, ICC], [ICC ≥ 0.90], [[45], [46]],
    [SPPB], [Weighted κ; % within 1 point], [κ ≥ 0.80], [Substantial MCID [5]],
    [Clinician AWGS class with M2M], [Sensitivity, specificity, % indeterminate], [Sens ≥ 0.85, spec ≥ 0.80], [STARD 2015 [43]],
    [Reliability], [Test--retest ICC, SEM, MDC95], [MDC95 < substantial MCID], [COSMIN [50]],
    [Forecasting], [MPJPE at 0.5/1/2 s; 12-month endpoint MAE], [Endpoint MAE < 0.10 m/s], [MCID [5]; TRIPOD+AI [42]],
    [Calibration], [90% interval coverage; calibration slope], [Coverage 0.88--0.92], [TRIPOD+AI [42]],
    [Fairness], [All metrics by sex, age band, BMI band], [No subgroup below threshold], [TRIPOD+AI [42]],
    [Human factors], [Assessment time, SUS, NASA-TLX per stakeholder], [SUS ≥ 68], [DECIDE-AI [44]],
  ),
  caption: [Metrics and pre-registered acceptance thresholds],
) <tab-metrics>

== Implementation <sec-impl>
Models are implemented in PyTorch; triangulation uses Pose2Sim [51], and musculoskeletal computations use OpenSim 4.x [26] with opencap-processing [28]. Training uses subject-level five-fold cross-validation on C1, with C2 held out entirely as an external test set. Target inference time for kinematics is under 10 min per visit on one workstation GPU, so the pipeline can run on hospital premises; the contact-sphere simulation adds minutes per trial.

== Results (to be reported)

#figure(
  table(
    columns: (1.6fr, 1fr, 1fr, 0.9fr, 0.6fr, 0.6fr, 0.6fr),
    [Method], [Gait speed bias (m/s)], [Gait speed LoA (m/s)], [Chair-stand ICC], [SPPB κ], [AWGS sens], [AWGS spec],
    [B1 Observational rating], [], [], [], [], [], [],
    [B2 Generic video-only], [], [], [], [], [], [],
    [B3 Anatomy-constrained video], [], [], [], [], [], [],
    [B4 MRI-only], [], [], [], [], [], [],
    [M2M (full)], [], [], [], [], [], [],
  ),
  caption: [Endpoint agreement on C2 (to be completed)],
) <tab-results>

#figure(
  table(
    columns: (1.6fr, 1fr, 0.7fr, 1fr, 1.2fr),
    [Variant], [Knee flexion MAE (°)], [Torque r], [Gait speed LoA (m/s)], [12-month forecast MAE (m/s)],
    [M2M (full)], [], [], [], [],
    [A1 − MRI scaling], [], [], [], [],
    [A2 − fat-fraction term], [], [], [], [],
    [A3 − pennation term], [], [], [], [],
    [A4 − capacity in forecaster], [], [], [], [],
    [A6 − second camera], [], [], [], [],
  ),
  caption: [Ablations on C1 (to be completed)],
) <tab-ablation-results>

= Conclusion (Expected) <sec-conclusion>
This section states the conclusions the study is designed to support. Each will be confirmed, qualified or withdrawn once @tab-results and @tab-ablation-results are filled.

We presented MRI-to-Motion (M2M), a reference architecture that joins individual-muscle MRI, subject-specific musculoskeletal capacity and two-camera video biomechanics, proposes capacity-conditioned forecasting, and reports every output as a clinical endpoint with uncertainty. We expect the study to support five conclusions.

+ *MRI capacity makes video analysis clinically usable.* Conditioning on MRI-derived geometry and capacity should reduce kinematic error (A1) and bring gait-speed limits of agreement inside the ±0.10 m/s substantial MCID, which generic video-only pipelines (B2, B3) are not expected to reach in sarcopenic patients.
+ *Muscle quality, not only quantity, explains weakness.* Removing the fat-fraction term (A2) should degrade torque prediction and endpoint agreement most in patients with high IMAT, consistent with evidence that thigh IMAT relates to mobility independently of lean mass [10].
+ *The pipeline outperforms observation by eye.* M2M should exceed the inter-rater reliability of clinician observational rating (B1) and reach ICC ≥ 0.90 for timed endpoints, making longitudinal tracking at the MCID scale feasible.
+ *Capacity conditioning improves forecasting.* Once M6 is built, a capacity-conditioned forecaster should reduce 12-month functional forecast error relative to a motion-only forecaster (B5, A4), and its counterfactual mode should give dietitians and physiotherapists a quantitative target for intervention.
+ *A shared, standards-aligned record serves all stakeholders.* Mapping outputs to AWGS 2025, SPPB and MCID, with an explicit indeterminate flag and clinician classification, should let physicians, therapists, radiologists, dietitians and patients act on the same evidence while meeting TRIPOD+AI and DECIDE-AI reporting.

*Limitations.* MRI cost and access restrict M2M to referral settings; a reduced variant that infers capacity from video and anthropometrics alone is a planned extension. Muscle force is validated only indirectly, through joint torque and EMG timing; a physically plausible simulation does not guarantee correct muscle force. Two phones need a shared clock, since one frame of drift is 33 ms at 30 fps, and the monocular mode is less accurate than the two-camera rig. Cohorts are drawn from one Thai centre, so external validation in other populations is required before deployment.

*Future work.* Multi-centre validation, a home re-test mode using the patient's stored capacity model, and a prospective DECIDE-AI study measuring whether M2M changes clinical decisions and patient outcomes.

#heading(numbering: none)[References]
#set text(size: 9.5pt)
#set enum(numbering: "[1]")
+ A. J. Cruz-Jentoft et al., "Sarcopenia: revised European consensus on definition and diagnosis," _Age and Ageing_, vol. 48, no. 1, pp. 16--31, 2019, doi: 10.1093/ageing/afy169.
+ L.-K. Chen et al., "A focus shift from sarcopenia to muscle health in the AWGS 2025 consensus update," _Nature Aging_, vol. 5, no. 11, pp. 2164--2175, 2025.
+ National Statistical Office of Thailand, "The 2024 Survey of the Older Persons in Thailand," Bangkok, 2024; summarised in _Japan Labor Issues_, vol. 9, no. 55, 2025.
+ D. Matsuzaka, K. Wagatsuma, T. Shimada, K. Ikushima, and H. Fujisawa, "Reliability and validity of observational gait analysis by physical therapists," _Phys. Ther. Res._, vol. 28, no. 2, pp. 129--136, 2025.
+ S. Perera, S. H. Mody, R. C. Woodman, and S. A. Studenski, "Meaningful change and responsiveness in common physical performance measures in older adults," _J. Am. Geriatr. Soc._, vol. 54, no. 5, pp. 743--749, 2006, doi: 10.1111/j.1532-5415.2006.00701.x.
+ S. Perera, S. Studenski, J. M. Chandler, and J. M. Guralnik, "Magnitude and patterns of decline in health and function in 1 year affect subsequent 5-year survival," _J. Gerontol. A_, vol. 60, no. 7, pp. 894--900, 2005, doi: 10.1093/gerona/60.7.894.
+ J. M. Guralnik et al., "A short physical performance battery assessing lower extremity function," _J. Gerontol._, vol. 49, no. 2, pp. M85--M94, 1994.
+ D. Podsiadlo and S. Richardson, "The timed 'Up & Go': a test of basic functional mobility for frail elderly persons," _J. Am. Geriatr. Soc._, vol. 39, no. 2, pp. 142--148, 1991.
+ S. Studenski et al., "Gait speed and survival in older adults," _JAMA_, vol. 305, no. 1, pp. 50--58, 2011.
+ R. L. Marcus, O. Addison, L. E. Dibble, K. B. Foreman, G. Morrell, and P. LaStayo, "Intramuscular adipose tissue, sarcopenia, and mobility function in older individuals," _J. Aging Res._, vol. 2012, Art. 629637, 2012, doi: 10.1155/2012/629637.
+ V. Mazzoli et al., "Improved strength prediction combining MRI biomarkers of muscle quantity and quality," _NMR Biomed._, vol. 38, e70112, 2025, doi: 10.1002/nbm.70112.
+ B. S. Ghouth, O. Cigdem, and V. Mazzoli, "MR imaging-based biomarkers for strength prediction: a statistical shape and architecture modeling of quadriceps muscles," _J. Magn. Reson. Imaging_, vol. 64, pp. 685--698, 2026, doi: 10.1002/jmri.70377.
+ R. Ni, C. Meyer, S. Blemker, J. Hart, and X. Feng, "Automatic segmentation of all lower limb muscles from high-resolution MRI using a cascaded 3D deep CNN," _J. Med. Imaging_, vol. 6, no. 4, 044009, 2019, doi: 10.1117/1.JMI.6.4.044009.
+ A. Agosti et al., "Deep learning for automatic segmentation of thigh and leg muscles," _MAGMA_, vol. 35, pp. 467--483, 2022, doi: 10.1007/s10334-021-00967-4.
+ R. Colglazier et al., "SegmentAnyMuscle: a universal muscle segmentation model across different locations in MRI," _Comput. Biol. Med._, vol. 216, 111944, 2025.
+ F. Isensee, P. F. Jaeger, S. A. A. Kohl, J. Petersen, and K. H. Maier-Hein, "nnU-Net: a self-configuring method for deep learning-based biomedical image segmentation," _Nat. Methods_, vol. 18, pp. 203--211, 2021.
+ T. Akinci D'Antonoli et al., "TotalSegmentator MRI: robust sequence-independent segmentation of multiple anatomic structures in MRI," _Radiology_, vol. 314, no. 2, e241613, 2025, doi: 10.1148/radiol.241613.
+ W. H. Henson et al., "Automatic segmentation of lower limb muscles from MR images of post-menopausal women based on deep learning and data augmentation," _PLOS ONE_, vol. 19, 2024, doi: 10.1371/journal.pone.0299099.
+ N. Decaux et al., "Semi-automatic muscle segmentation in MR images using deep registration-based label propagation," _Pattern Recognit._, vol. 140, 2023, doi: 10.1016/j.patcog.2023.109529.
+ S. Blemker, D. S. Asakawa, G. Gold, and S. Delp, "Image-based musculoskeletal modeling: applications, advances, and future opportunities," _J. Magn. Reson. Imaging_, vol. 25, 2007, doi: 10.1002/jmri.20805.
+ L. Modenese and J. Kohout, "Automated generation of three-dimensional complex muscle geometries for use in personalised musculoskeletal models," _Ann. Biomed. Eng._, vol. 48, pp. 1793--1804, 2020.
+ E. Stansfield, W. Koller, B. A. M. Gonçalves, and H. Kainz, "Do we need medical imaging-informed musculoskeletal models for simulations in healthy adults?" _PLOS Comput. Biol._, vol. 22, e1014073, 2026.
+ M. Gambietz et al., "From body hulls to musculoskeletal models: personalized inertial parameter estimation," _PLOS ONE_, vol. 21, e0349886, 2026.
+ M. H. C. van Riel, T. van Leeuwen, C. A. T. van den Berg, and A. Sbrizzi, "Time-resolved reconstruction of motion, force, and stiffness using spectro-dynamic MRI," _IEEE Trans. Comput. Imaging_, vol. 9, pp. 917--927, 2023.
+ S. L. Delp et al., "OpenSim: open-source software to create and analyze dynamic simulations of movement," _IEEE Trans. Biomed. Eng._, vol. 54, no. 11, pp. 1940--1950, 2007.
+ A. Seth et al., "OpenSim: simulating musculoskeletal dynamics and neuromuscular control to study human and animal movement," _PLOS Comput. Biol._, vol. 14, no. 7, e1006223, 2018.
+ M. Loper, N. Mahmood, J. Romero, G. Pons-Moll, and M. J. Black, "SMPL: a skinned multi-person linear model," _ACM Trans. Graph._, vol. 34, no. 6, 2015.
+ S. D. Uhlrich et al., "OpenCap: human movement dynamics from smartphone videos," _PLOS Comput. Biol._, vol. 19, 2023, doi: 10.1371/journal.pcbi.1011462.
+ S. Gilon, E. Y. Miller, and S. Uhlrich, "OpenCap Monocular: 3D human kinematics and musculoskeletal dynamics from a single smartphone video," arXiv:2603.24733, 2026.
+ F. Koleini et al., "BioPose: biomechanically-accurate 3D pose estimation from monocular videos," in _Proc. IEEE/CVF WACV_, 2025, pp. 6330--6339.
+ F. Koleini, H. Xue, A. Helmy, and P. Wang, "MonoMSK: monocular 3D musculoskeletal dynamics estimation," arXiv:2511.19326, 2025.
+ Y. Huo et al., "BioHuman: learning biomechanical human representations from video," arXiv:2605.14772, 2026.
+ M. Chiquier and C. Vondrick, "Muscles in Action," in _Proc. IEEE/CVF ICCV_, 2023, pp. 22034--22044.
+ K. Peng et al., "Towards video-based activated muscle group estimation in the wild," in _Proc. 32nd ACM Int. Conf. Multimedia_, 2024, doi: 10.1145/3664647.3680630.
+ K. Zhu, A. MohammadiNasrabadi, A. Wong, and J. McPhee, "3D human pose estimation with muscles," in _Adv. Neural Inf. Process. Syst. 38_, 2025.
+ A. Nasr, K. Zhu, and J. McPhee, "Using musculoskeletal models to generate physically-consistent data for 3D human pose, kinematic, dynamic, and muscle estimation," _Multibody Syst. Dyn._, vol. 64, pp. 737--770, 2024.
+ R. Ueno, "Calibrationless monocular vision musculoskeletal simulation during gait," _Heliyon_, vol. 10, 2024, doi: 10.1016/j.heliyon.2024.e32078.
+ L. Noteboom, M. Hoozemans, H. Veeger, and F. C. T. van der Helm, "Feasibility and validity of a single camera CNN driven musculoskeletal model for muscle force estimation during upper extremity strength exercises," _Front. Sports Act. Living_, vol. 4, 2022.
+ D. Rode et al., "Assessment of monocular human pose estimation models for clinical movement analysis," _Sci. Rep._, vol. 15, 2025, doi: 10.1038/s41598-025-22626-7.
+ J. Yang et al., "3D pose estimation and future motion prediction from 2D images," _Pattern Recognit._, vol. 124, 108439, 2022, doi: 10.1016/j.patcog.2021.108439.
+ S. Shin, J. Kim, E. Halilaj, and M. J. Black, "WHAM: reconstructing world-grounded humans with accurate 3D motion," in _Proc. IEEE/CVF CVPR_, 2024.
+ G. S. Collins et al., "TRIPOD+AI statement: updated guidance for reporting clinical prediction models that use regression or machine learning methods," _BMJ_, vol. 385, e078378, 2024, doi: 10.1136/bmj-2023-078378.
+ P. M. Bossuyt et al., "STARD 2015: an updated list of essential items for reporting diagnostic accuracy studies," _BMJ_, vol. 351, h5527, 2015.
+ B. Vasey et al., "Reporting guideline for the early-stage clinical evaluation of decision support systems driven by artificial intelligence: DECIDE-AI," _Nat. Med._, vol. 28, pp. 924--933, 2022.
+ J. M. Bland and D. G. Altman, "Statistical methods for assessing agreement between two methods of clinical measurement," _Lancet_, vol. 1, no. 8476, pp. 307--310, 1986.
+ T. K. Koo and M. Y. Li, "A guideline of selecting and reporting intraclass correlation coefficients for reliability research," _J. Chiropr. Med._, vol. 15, no. 2, pp. 155--163, 2016.
+ _IEEE Standard for Information Technology---Systems Design---Software Design Descriptions_, IEEE Std 1016-2009, 2009.
+ _Medical Device Software---Software Life Cycle Processes_, IEC 62304:2006+A1:2015.
+ _Medical Devices---Application of Risk Management to Medical Devices_, ISO 14971:2019.
+ L. B. Mokkink et al., "The COSMIN checklist for assessing the methodological quality of studies on measurement properties of health status measurement instruments," _Qual. Life Res._, vol. 19, pp. 539--549, 2010.
+ L. Pagnon, M. Domalain, and L. Reveret, "Pose2Sim: an open-source Python package for multiview markerless kinematics," _J. Open Source Softw._, vol. 7, no. 77, 4362, 2022.
+ T. Xiang, T. Tan, N. Schuetz, S. Delp, L. Fei-Fei, and E. Adeli, "HumanScore: benchmarking human motions in generated videos," arXiv:2604.20157, 2026.
+ T. Jiang et al., "RTMPose: real-time multi-person pose estimation based on MMPose," arXiv:2303.07399, 2023.
