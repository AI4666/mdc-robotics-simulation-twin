"""Helpers that write AnyLogic 8.9 .alp XML (agents, parameters, events, functions, statecharts, shapes).
Taken from a generator already proven to compile in AnyLogic 8.9.10 PLE. Used once to scaffold the model;
after that the .alp is edited with the AnyLogic CLI (cli-anything-anylogic) or in the AnyLogic IDE."""
import os
import uuid


PKG = "mdc_campus_courier"

_id = [1762800000000]


def nid():
    _id[0] += 1
    return _id[0]


def cd(s):
    assert "]]>" not in s
    return f"<![CDATA[{s}]]>"


def argb(r, g, b, a=255):
    v = (a << 24) | (r << 16) | (g << 8) | b
    return v - (1 << 32) if v >= (1 << 31) else v


def head(name, x, y, show_label=True, presentation=False, public=False, lx=10, ly=0):
    return (f"<Id>{nid()}</Id>\n<Name>{cd(name)}</Name>\n<X>{x}</X><Y>{y}</Y>\n"
            f"<Label><X>{lx}</X><Y>{ly}</Y></Label>\n<PublicFlag>{str(public).lower()}</PublicFlag>\n"
            f"<PresentationFlag>{str(presentation).lower()}</PresentationFlag>\n"
            f"<ShowLabel>{str(show_label).lower()}</ShowLabel>\n")


# ---------------------------------------------------------------- design-time elements
def parameter(name, typ, default, x, y, label, editor="TEXT_BOX"):
    return f"""<Variable Class="Parameter">
{head(name, x, y, lx=20)}<Properties SaveInSnapshot="true" ModificatorType="STATIC">
<Type>{cd(typ)}</Type>
<UnitType>{cd("NONE")}</UnitType>
<SdArray>false</SdArray>
<DefaultValue Class="CodeValue">
<Code>{cd(default)}</Code>
</DefaultValue>
<ParameterEditor>
<Id>{nid()}</Id>
<Name>{cd("null")}</Name>
<Label>{cd(label)}</Label>
<EditorContolType>{editor}</EditorContolType>
<MinSliderValue>{cd("0")}</MinSliderValue>
<MaxSliderValue>{cd("100")}</MaxSliderValue>
<DelimeterType>NO_DELIMETER</DelimeterType>
</ParameterEditor>
</Properties>
</Variable>
"""


def variable(name, typ, init, x, y):
    iv = f"""<InitialValue Class="CodeValue">
<Code>{cd(init)}</Code>
</InitialValue>
""" if init is not None else ""
    return f"""<Variable Class="PlainVariable">
{head(name, x, y)}<Properties SaveInSnapshot="true" Constant="false" AccessType="public" StaticVariable="false">
<Type>{cd(typ)}</Type>
{iv}</Properties>
</Variable>
"""


def function(name, ret, params, body, x, y):
    mod = "VOID" if ret is None else "RETURNS_VALUE"
    ps = "".join(f"<Parameter>\n<Name>{cd(n)}</Name>\n<Type>{cd(t)}</Type>\n</Parameter>\n" for n, t in params)
    return f"""<Function AccessType="default" StaticFunction="false">
<ReturnModificator>{mod}</ReturnModificator>
<ReturnType>{cd(ret or "double")}</ReturnType>
{head(name, x, y)}{ps}<Body>{cd(body)}</Body>
</Function>
"""


def cyclic_event(name, first, every, action, x, y):
    return f"""<Event>
{head(name, x, y)}<Properties TriggerType="timeout" Mode="cyclic">
<Timeout Class="CodeUnitValue">
<Code>{cd(str(every))}</Code>
<Unit Class="TimeUnits">{cd("SECOND")}</Unit>
</Timeout>
<Rate Class="CodeUnitValue">
<Code>{cd("1")}</Code>
<Unit Class="RateUnits">{cd("PER_SECOND")}</Unit>
</Rate>
<OccurrenceAtTime>true</OccurrenceAtTime>
<OccurrenceDate>1762819200000</OccurrenceDate>
<OccurrenceTime Class="CodeUnitValue">
<Code>{cd(str(first))}</Code>
<Unit Class="TimeUnits">{cd("SECOND")}</Unit>
</OccurrenceTime>
<RecurrenceCode Class="CodeUnitValue">
<Code>{cd(str(every))}</Code>
<Unit Class="TimeUnits">{cd("SECOND")}</Unit>
</RecurrenceCode>
<Condition>{cd("false")}</Condition>
</Properties>
<Action>{cd(action)}</Action>
</Event>
"""


# ---------------------------------------------------------------- statechart elements
def state(sid, name, x, y, w, h, color, entry=""):
    ea = f"<EntryAction>{cd(entry)}</EntryAction>\n" if entry else ""
    return f"""<StatechartElement Class="State" ParentState="ROOT_NODE">
<Id>{sid}</Id>
<Name>{cd(name)}</Name>
<X>{x}</X><Y>{y}</Y>
<Label><X>10</X><Y>10</Y></Label>
<PublicFlag>false</PublicFlag>
<PresentationFlag>true</PresentationFlag>
<ShowLabel>true</ShowLabel>
<Properties Width="{w}" Height="{h}">
{ea}<FillColor>{color}</FillColor>
</Properties>
</StatechartElement>
"""


def branch(bid, name, x, y):
    return f"""<StatechartElement Class="Branch" ParentState="ROOT_NODE">
<Id>{bid}</Id>
<Name>{cd(name)}</Name>
<X>{x}</X><Y>{y}</Y>
<Label><X>10</X><Y>0</Y></Label>
<PublicFlag>false</PublicFlag>
<PresentationFlag>true</PresentationFlag>
<ShowLabel>true</ShowLabel>
<Properties>
</Properties>
</StatechartElement>
"""


def transition(name, src, tgt, x, y, pts, trigger, condition="true", action="", default=True,
               lx=10, ly=0):
    p = "".join(f"<Point><X>{a}</X><Y>{b}</Y></Point>\n" for a, b in pts)
    act = f"<Action>{cd(action)}</Action>\n" if action else ""
    return f"""<StatechartElement Class="Transition" ParentState="ROOT_NODE">
<Id>{nid()}</Id>
<Name>{cd(name)}</Name>
<X>{x}</X><Y>{y}</Y>
<Label><X>{lx}</X><Y>{ly}</Y></Label>
<PublicFlag>false</PublicFlag>
<PresentationFlag>true</PresentationFlag>
<ShowLabel>true</ShowLabel>
<Points>
{p}</Points>
<IconOffset>20.0</IconOffset>
<Properties Source="{src}" Target="{tgt}" Trigger="{trigger}">
{act}<Timeout Class="CodeUnitValue">
<Code>{cd("1")}</Code>
<Unit Class="TimeUnits">{cd("SECOND")}</Unit>
</Timeout>
<Condition>{cd(condition)}</Condition>
<Rate Class="CodeUnitValue">
<Code>{cd("1")}</Code>
<Unit Class="RateUnits">{cd("PER_SECOND")}</Unit>
</Rate>
<MessageType>{cd("Object")}</MessageType>
<DefaultTransition>{str(default).lower()}</DefaultTransition>
<FilterType>{cd("unconditionally")}</FilterType>
<EqualsExpression>{cd("Sample_Message")}</EqualsExpression>
<SatisfiesExpression>{cd("true")}</SatisfiesExpression>
</Properties>
</StatechartElement>
"""


def entry_point(name, target, x, y, pts):
    p = "".join(f"<Point><X>{a}</X><Y>{b}</Y></Point>\n" for a, b in pts)
    return f"""<StatechartElement Class="EntryPoint" ParentState="ROOT_NODE">
<Id>{nid()}</Id>
<Name>{cd(name)}</Name>
<X>{x}</X><Y>{y}</Y>
<Label><X>-10</X><Y>-15</Y></Label>
<PublicFlag>false</PublicFlag>
<PresentationFlag>true</PresentationFlag>
<ShowLabel>true</ShowLabel>
<Points>
{p}</Points>
<Properties Target="{target}">
</Properties>
</StatechartElement>
"""


# ---------------------------------------------------------------- presentation shapes
def shape_head(name, x, y, xcode=None):
    xc = f"<XCode>{cd(xcode)}</XCode>\n" if xcode else ""
    return (f"<Id>{nid()}</Id>\n<Name>{cd(name)}</Name>\n<X>{x}</X><Y>{y}</Y>\n"
            f"<Label><X>0</X><Y>-10</Y></Label>\n<PublicFlag>true</PublicFlag>\n"
            f"<PresentationFlag>true</PresentationFlag>\n<ShowLabel>false</ShowLabel>\n"
            f"<DrawMode>SHAPE_DRAW_2D</DrawMode>\n{xc}<EmbeddedIcon>false</EmbeddedIcon>\n<Z>0</Z>\n")


_shape_n = [0]


def sname(prefix):
    _shape_n[0] += 1
    return f"{prefix}{_shape_n[0]}"


def text(x, y, txt, code=None, color=argb(0, 0, 0), size=12, bold=False, align="LEFT", xcode=None):
    tc = f"<TextCode>{cd(code)}</TextCode>\n" if code else ""
    return f"""<Text>
{shape_head(sname("text"), x, y, xcode)}<Rotation>0.0</Rotation>
<Color>{color}</Color>
<Text>{cd(txt)}</Text>
{tc}<Font>
<Name>SansSerif</Name>
<Size>{size}</Size>
<Style>{1 if bold else 0}</Style>
</Font>
<Alignment>{align}</Alignment>
</Text>
"""


def rect(x, y, w, h, fill, line=None, fill_code=None):
    lc = f"<LineColor>{line}</LineColor>" if line is not None else "<LineColor/>"
    fc = f"<FillColorCode>{cd(fill_code)}</FillColorCode>\n" if fill_code else ""
    return f"""<Rectangle>
{shape_head(sname("rect"), x, y)}<ZHeight>0</ZHeight>
<LineWidth>1</LineWidth>
{lc}
<LineMaterial>null</LineMaterial>
<LineStyle>SOLID</LineStyle>
<Width>{w}</Width>
<Height>{h}</Height>
<Rotation>0.0</Rotation>
<FillColor>{fill}</FillColor>
{fc}<FillMaterial>null</FillMaterial>
</Rectangle>
"""


def oval(x, y, r, fill, fill_code=None, xcode=None):
    fc = f"<FillColorCode>{cd(fill_code)}</FillColorCode>\n" if fill_code else ""
    return f"""<Oval>
{shape_head(sname("oval"), x, y, xcode)}<ZHeight>10</ZHeight>
<LineWidth>2</LineWidth>
<LineColor>{argb(40, 40, 40)}</LineColor>
<LineMaterial>null</LineMaterial>
<LineStyle>SOLID</LineStyle>
<RadiusX>{r}</RadiusX>
<RadiusY>{r}</RadiusY>
<Rotation>0.0</Rotation>
<FillColor>{fill}</FillColor>
{fc}<FillMaterial>null</FillMaterial>
</Oval>
"""


def time_plot(name, x, y, w, h, datasets, vmax):
    ds = "".join(f"""<DatasetExpression>
<Title>{cd(t)}</Title>
<Expression>{cd(dn)}</Expression>
<Color>{c}</Color>
<Expression2>{cd(e)}</Expression2>
<Expression2Flag>true</Expression2Flag>
<PointStyle>NONE</PointStyle>
<LineWidth>2.0</LineWidth>
</DatasetExpression>
""" for t, dn, e, c in datasets)
    return f"""<TimePlot>
<Id>{nid()}</Id>
<Name>{cd(name)}</Name>
<X>{x}</X><Y>{y}</Y>
<Label><X>0</X><Y>-10</Y></Label>
<PublicFlag>true</PublicFlag>
<PresentationFlag>true</PresentationFlag>
<ShowLabel>false</ShowLabel>
<AutoUpdate>true</AutoUpdate>
<OccurrenceAtTime>true</OccurrenceAtTime>
<OccurrenceDate>1762819200000</OccurrenceDate>
<OccurrenceTime Class="CodeUnitValue">
<Code>{cd("0")}</Code>
<Unit Class="TimeUnits">{cd("SECOND")}</Unit>
</OccurrenceTime>
<RecurrenceCode Class="CodeUnitValue">
<Code>{cd("3")}</Code>
<Unit Class="TimeUnits">{cd("SECOND")}</Unit>
</RecurrenceCode>
<EmbeddedIcon>false</EmbeddedIcon>
<Width>{w}</Width>
<Height>{h}</Height>
<BackgroundColor/>
<BorderColor/>
<ChartArea>
<XOffset>40</XOffset>
<YOffset>20</YOffset>
<Width>{w - 60}</Width>
<Height>{h - 70}</Height>
<BackgroundColor>-1</BackgroundColor>
<BorderColor>-16777216</BorderColor>
<GridColor>-12566464</GridColor>
</ChartArea>
<Legend>
<Place>SOUTH</Place>
<TextColor>-16777216</TextColor>
<Size>30</Size>
</Legend>
<Labels>
<HorLabelsPosition>DEFAULT</HorLabelsPosition>
<VerLabelsPosition>DEFAULT</VerLabelsPosition>
<TextColor>-12566464</TextColor>
</Labels>
<ShowLegend>true</ShowLegend>
<TimeWindowsMovementType>MOVEMENT_WITH_DATA</TimeWindowsMovementType>
<TimeWindowUnits>MODEL_TIME_UNIT</TimeWindowUnits>
<VerScaleFromExpression>{cd("0")}</VerScaleFromExpression>
<VerScaleToExpression>{cd(str(vmax))}</VerScaleToExpression>
<VerScaleType>FIXED</VerScaleType>
<DrawLine>true</DrawLine>
<Interpolation>LINEAR</Interpolation>
{ds}<SamplesToKeep>400</SamplesToKeep>
<TimeWindowExpression>{cd("900")}</TimeWindowExpression>
<FillAreaUnderLine>false</FillAreaUnderLine>
<LabelFormat>MODEL_TIME_UNITS</LabelFormat>
</TimePlot>
"""


# ---------------------------------------------------------------- agent class wrapper
def agent_class(name, *, startup="", extra_code="", variables="", statechart="", events="",
                functions="", container_main=False, embedded="", presentation=""):
    cid = nid()
    gp = nid()
    link = nid()
    level = nid()
    ac = f"<AdditionalClassCode>{cd(extra_code)}</AdditionalClassCode>\n" if extra_code else ""
    su = f"<StartupCode>{cd(startup)}</StartupCode>\n" if startup else ""
    cl = f"""<ContainerLinks>
<ContainerLink>
<Id>{nid()}</Id>
<Name>{cd("main")}</Name>
<X>50</X><Y>-100</Y>
<Label><X>10</X><Y>0</Y></Label>
<PublicFlag>false</PublicFlag>
<PresentationFlag>true</PresentationFlag>
<ShowLabel>true</ShowLabel>
<ActiveObjectClass>
<PackageName>{cd(PKG)}</PackageName>
<ClassName>{cd("Main")}</ClassName>
</ActiveObjectClass>
</ContainerLink>
</ContainerLinks>
""" if container_main else ""
    xml = f"""<ActiveObjectClass>
<Id>{cid}</Id>
<Name>{cd(name)}</Name>
{ac}{su}<Generic>false</Generic>
<GenericParameter>
<Id>{gp}</Id>
<Name>{cd(str(gp))}</Name>
<GenericParameterValue Class="CodeValue">
<Code>{cd("T")}</Code>
</GenericParameterValue>
<GenericParameterLabel>{cd("Generic parameters:")}</GenericParameterLabel>
</GenericParameter>
<FlowChartsUsage>ENTITY</FlowChartsUsage>
<SamplesToKeep>100</SamplesToKeep>
<LimitNumberOfArrayElements>false</LimitNumberOfArrayElements>
<ElementsLimitValue>100</ElementsLimitValue>
<MakeDefaultViewArea>false</MakeDefaultViewArea>
<SceneGridColor/>
<SceneBackgroundColor>-4144960</SceneBackgroundColor>
<SceneSkybox>null</SceneSkybox>
<AgentProperties>
<EnvironmentDefinesInitialLocation>true</EnvironmentDefinesInitialLocation>
<RotateAnimationTowardsMovement>true</RotateAnimationTowardsMovement>
<RotateAnimationVertically>false</RotateAnimationVertically>
<VelocityCode Class="CodeUnitValue">
<Code>{cd("10")}</Code>
<Unit Class="SpeedUnits">{cd("MPS")}</Unit>
</VelocityCode>
<PhysicalLength Class="CodeUnitValue">
<Code>{cd("1")}</Code>
<Unit Class="LengthUnits">{cd("METER")}</Unit>
</PhysicalLength>
<PhysicalWidth Class="CodeUnitValue">
<Code>{cd("1")}</Code>
<Unit Class="LengthUnits">{cd("METER")}</Unit>
</PhysicalWidth>
<PhysicalHeight Class="CodeUnitValue">
<Code>{cd("1")}</Code>
<Unit Class="LengthUnits">{cd("METER")}</Unit>
</PhysicalHeight>
</AgentProperties>
<EnvironmentProperties>
<EnableSteps>false</EnableSteps>
<StepDurationCode Class="CodeUnitValue">
<Code>{cd("1.0")}</Code>
<Unit Class="TimeUnits">{cd("SECOND")}</Unit>
</StepDurationCode>
<SpaceType>CONTINUOUS</SpaceType>
<WidthCode>{cd("500")}</WidthCode>
<HeightCode>{cd("500")}</HeightCode>
<ZHeightCode>{cd("0")}</ZHeightCode>
<ColumnsCountCode>{cd("100")}</ColumnsCountCode>
<RowsCountCode>{cd("100")}</RowsCountCode>
<NeigborhoodType>MOORE</NeigborhoodType>
<LayoutType>USER_DEF</LayoutType>
<NetworkType>USER_DEF</NetworkType>
<ConnectionsPerAgentCode>{cd("2")}</ConnectionsPerAgentCode>
<ConnectionsRangeCode>{cd("50")}</ConnectionsRangeCode>
<NeighborLinkFractionCode>{cd("0.95")}</NeighborLinkFractionCode>
<MCode>{cd("10")}</MCode>
</EnvironmentProperties>
<DatasetsCreationProperties>
<AutoCreate>false</AutoCreate>
<Id>{nid()}</Id>
<OccurrenceAtTime>true</OccurrenceAtTime>
<OccurrenceDate>1762819200000</OccurrenceDate>
<OccurrenceTime Class="CodeUnitValue">
<Code>{cd("0")}</Code>
<Unit Class="TimeUnits">{cd("SECOND")}</Unit>
</OccurrenceTime>
<RecurrenceCode Class="CodeUnitValue">
<Code>{cd("1")}</Code>
<Unit Class="TimeUnits">{cd("SECOND")}</Unit>
</RecurrenceCode>
</DatasetsCreationProperties>
<ScaleRuler>
<Id>{nid()}</Id>
<Name>{cd("scale")}</Name>
<X>0</X><Y>-150</Y>
<PublicFlag>false</PublicFlag>
<PresentationFlag>false</PresentationFlag>
<ShowLabel>false</ShowLabel>
<DrawMode>SHAPE_DRAW_2D3D</DrawMode>
<Length>100</Length>
<Rotation>0</Rotation>
<ScaleType>BASED_ON_LENGTH</ScaleType>
<ModelLength>10</ModelLength>
<LengthUnits>METER</LengthUnits>
<Scale>10</Scale>
<InheritedFromParentAgentType>true</InheritedFromParentAgentType>
</ScaleRuler>
<CurrentLevel>{level}</CurrentLevel>
<ConnectionsId>{link}</ConnectionsId>
<Variables>
{variables}</Variables>
"""
    if statechart:
        xml += f"<StatechartElements>\n{statechart}</StatechartElements>\n"
    if events:
        xml += f"<Events>\n{events}</Events>\n"
    if functions:
        xml += f"<Functions>\n{functions}</Functions>\n"
    xml += f"""<AgentLinks>
<AgentLink>
<Id>{link}</Id>
<Name>{cd("connections")}</Name>
<X>50</X><Y>-50</Y>
<Label><X>15</X><Y>0</Y></Label>
<PublicFlag>false</PublicFlag>
<PresentationFlag>true</PresentationFlag>
<ShowLabel>true</ShowLabel>
<HandleReceiveInConnections>false</HandleReceiveInConnections>
<AgentLinkType>COLLECTION_OF_LINKS</AgentLinkType>
<AgentLinkBidirectional>true</AgentLinkBidirectional>
<MessageType>{cd("Object")}</MessageType>
<LineStyle>SOLID</LineStyle>
<LineWidth>1</LineWidth>
<LineColor>-16777216</LineColor>
<LineZOrder>UNDER_AGENTS</LineZOrder>
<LineArrow>NONE</LineArrow>
<LineArrowPosition>END</LineArrowPosition>
</AgentLink>
</AgentLinks>
{cl}"""
    if embedded:
        xml += f"<EmbeddedObjects>\n{embedded}</EmbeddedObjects>\n"
    xml += f"""<Presentation>
<Level>
<Id>{level}</Id>
<Name>{cd("level")}</Name>
<X>0</X><Y>0</Y>
<Label><X>10</X><Y>0</Y></Label>
<PublicFlag>true</PublicFlag>
<PresentationFlag>true</PresentationFlag>
<ShowLabel>false</ShowLabel>
<DrawMode>SHAPE_DRAW_2D3D</DrawMode>
<Z>0</Z>
<LevelVisibility>ALWAYS_SHOW</LevelVisibility>
<Presentation>
{presentation}</Presentation>
</Level>
</Presentation>
</ActiveObjectClass>
"""
    return xml, gp


def fighter_instance(name, fighter_gp, x, y, params):
    ps = "".join(f"""<Parameter>
<Name>{cd(n)}</Name>
<Value Class="CodeValue">
<Code>{cd(v)}</Code>
</Value>
</Parameter>
""" for n, v in params)
    return f"""<EmbeddedObject>
{head(name, x, y, lx=20)}<ActiveObjectClass>
<PackageName>{cd(PKG)}</PackageName>
<ClassName>{cd("Fighter")}</ClassName>
</ActiveObjectClass>
<GenericParameterSubstitute>
<GenericParameterSubstituteReference>
<PackageName>{cd(PKG)}</PackageName>
<ClassName>{cd("Fighter")}</ClassName>
<ItemName>{cd(str(fighter_gp))}</ItemName>
</GenericParameterSubstituteReference>
</GenericParameterSubstitute>
<Parameters>
{ps}</Parameters>
<ReplicationFlag>false</ReplicationFlag>
<Replication Class="CodeValue">
<Code>{cd("100")}</Code>
</Replication>
<CollectionType>ARRAY_LIST_BASED</CollectionType>
<InitialSpeedCode Class="CodeUnitValue">
<Code>{cd("10")}</Code>
<Unit Class="SpeedUnits">{cd("MPS")}</Unit>
</InitialSpeedCode>
<InitialLocationType>AT_ANIMATION_POSITION</InitialLocationType>
<XCode Class="CodeValue">
<Code>{cd("0")}</Code>
</XCode>
<YCode Class="CodeValue">
<Code>{cd("0")}</Code>
</YCode>
<ZCode Class="CodeValue">
<Code>{cd("0")}</Code>
</ZCode>
<ColumnCode Class="CodeValue">
<Code>{cd("0")}</Code>
</ColumnCode>
<RowCode Class="CodeValue">
<Code>{cd("0")}</Code>
</RowCode>
<LatitudeCode Class="CodeValue">
<Code>{cd("0")}</Code>
</LatitudeCode>
<LongitudeCode Class="CodeValue">
<Code>{cd("0")}</Code>
</LongitudeCode>
<LocationNameCode Class="CodeValue">
<Code>{cd('""')}</Code>
</LocationNameCode>
<InitializationType>SPECIFIED_NUMBER</InitializationType>
<InitializationDatabaseTableQuery>
<TableReference>
</TableReference>
</InitializationDatabaseTableQuery>
<InitializationDatabaseType>ONE_AGENT_PER_DATABASE_RECORD</InitializationDatabaseType>
<QuantityColumn>
</QuantityColumn>
</EmbeddedObject>
"""


# ======================================================================== FIGHTER AGENT

CONVERTERS = """9f7858c9-b2c8-4ead-9244-fd08833f642b 404652e6-561a-404c-aab2-ab7415f40ef5 6fd6cd57-6dfe-4fc6-be0b-c74065351957
3325dc48-3ad4-41e3-836f-dfd0e98fe1ed 3f69ef3d-706e-41a6-8af0-11658c5eef68 3f6fe405-e047-4304-91d6-6eee206d1106
820d2b51-5b4a-48e7-b0b6-e46418e3c0f2 630818fa-8975-4b70-976f-03180dce01db 7c7e471c-004e-495e-a4ad-d840620ab38e
3e38ff63-1f70-4ec0-b42c-e879b146785d b1eb86e4-14b3-405c-8257-56b80f1b485d d55f9fb6-86bb-45ea-9db1-79cecfa0ce91
ab77aafd-8f02-4354-b789-928d45b1f73c e4f14fd7-1c4a-42e9-b91d-db2415f475db 6d208120-6c7a-45a6-b411-402f18890d9b
1816cdd0-177c-4973-9e88-dd8b95318556 5c23f62f-06dc-46ad-8ead-688ec434e3e5 5c7d7990-3f35-41eb-ae16-d0c16098acc6
02a16c52-a834-4f30-b6af-a6aee51a294e f0988929-2718-4984-a1b6-c1f2ce152f1f 1c9d9cfe-ea2b-43f9-8f62-dc31d8ed3ae1
34cb742a-8ba4-47a7-87e6-f2685fe69e97 4fe10751-c399-4752-94b7-30113ad45070 c13fe5ac-6466-446e-886a-12df1431b1eb
714f9ca2-426e-4bff-8569-2d18f58fdcf8 045aeb5f-1087-4ac7-9702-a49404e7f7e8 840e9a0a-de98-4b7d-a172-f9bbda2d6b98
e342358b-75ed-4812-9376-6043fb6cb473 f3d5ccdc-1bb3-466f-871d-f6b92a26cbb4 59acb6fb-561c-4038-b722-a596a748b3c7
be7e6726-05c0-4228-821d-a8df91aeb5bc df4a6a60-9ce8-4c6c-91c0-ad5a5d732259 47491eb9-4606-42bd-8399-125a2b95fded
9b2d1306-5d19-439a-8f2c-b144dd7e22fa ef421152-8732-4f97-9acb-c8e9a6890d5e d48f8080-25b1-44f5-8322-7bf2712ff974
6c4de826-daad-4cd4-b703-51dfe803e822 01af22d6-6889-4e98-a3df-e6eddc40fc92 ea3b3dbe-cca2-4bde-957b-feaef7e18789
e737c8c6-b526-4f88-b89e-554e205b0614 efd24e87-d7f7-425f-9cb0-3ee17c7b2116 a62607e6-047e-4910-a1ec-5426bf9283b5
64dceb5b-de05-47c7-8e40-e9b293e80d75 8d51c652-6aee-4de8-ba03-47b289a13ec5 51d7b5ce-5664-4750-b1a0-fabcdc31e49a
6522e3af-aa9e-421c-b667-e11db73cd8ca 9ac073a0-7abf-4dff-826f-9c44d4780590 2da9c21c-adc7-405a-a36e-46fbd9dfcd42
fe4d1053-9c84-4221-bac7-cb489a7064ff 1f005f88-e6d7-4bdc-81fa-3acf4c89cf64 42dc5a7c-d7b1-4653-92b9-9359b46cc2d4
e25721a9-34f9-479c-a4c3-31f5ec9e117d 506d1de3-06df-4131-9e88-e43f1768e3d8 e6625695-25a2-43d0-9056-1e9a1a594b1e
91990287-4edf-4e38-aa6c-66d0e906807b 2216cdd0-177c-5678-9e88-dd8b95312234 1737c8c6-b526-4dd8-589e-ee4e205b06f4
6a43bef6-8b70-4253-a828-82c3ab399655""".split()

DESCRIPTION = ("Agent-based model of an MMA fight: a Kicker (likes long range) vs a Boxer (likes close range). "
               "Each fighter follows 3 simple rules every exchange: Rule 3 HURT (defend after taking 2+ hits), "
               "Rule 1 RANGE (attack at favorite distance, otherwise move toward it), "
               "Rule 2 MEMORY (pick combos that landed before). Discussion 4, CAI 4505C.")


def assemble(model_name, pkg, main_xml, fighter_xml, main_id, frame_w=1000, frame_h=600,
             title="FightABM : Simulation", description=DESCRIPTION, resources=""):
    """The whole .alp file around the two agent types (also used by build_alp3d.py)."""
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!--
*************************************************
	         AnyLogic Project File
*************************************************
-->
<AnyLogicWorkspace WorkspaceVersion="1.9" AnyLogicVersion="8.9.6.qualifier" AlpVersion="8.9.6">
<Model>
<Id>{nid()}</Id>
<Name>{cd(model_name)}</Name>
<Description>{cd(description)}</Description>
<EngineVersion>6</EngineVersion>
<JavaPackageName>{cd(pkg)}</JavaPackageName>
<ModelTimeUnit>{cd("Second")}</ModelTimeUnit>
<Folders>
</Folders>
<ActiveObjectClasses>
{main_xml}{fighter_xml}</ActiveObjectClasses>
<DifferentialEquationsMethod>EULER</DifferentialEquationsMethod>
<MixedEquationsMethod>RK45_NEWTON</MixedEquationsMethod>
<AlgebraicEquationsMethod>MODIFIED_NEWTON</AlgebraicEquationsMethod>
<AbsoluteAccuracy>1.0E-5</AbsoluteAccuracy>
<FixedTimeStep>0.01</FixedTimeStep>
<RelativeAccuracy>1.0E-5</RelativeAccuracy>
<TimeAccuracy>1.0E-5</TimeAccuracy>
<InspectionWindowColorTheme>DEFAULT</InspectionWindowColorTheme>
<Frame>
<Id>{nid()}</Id>
<Width>{frame_w}</Width>
<Height>{frame_h}</Height>
</Frame>
<Database>
<Id>{nid()}</Id>
<Logging>false</Logging>
<AutoExport>false</AutoExport>
<ShutdownCompact>false</ShutdownCompact>
<ImportSettings>
</ImportSettings>
<ExportSettings>
</ExportSettings>
</Database>
<RunConfiguration ActiveObjectClassId="{main_id}">
<Id>{nid()}</Id>
<Name>{cd("RunConfiguration")}</Name>
<MaximumMemory>2048</MaximumMemory>
<ModelTimeProperties>
<StopOption>{cd("Stop at specified time")}</StopOption>
<InitialDate>{cd("1762819200000")}</InitialDate>
<InitialTime>{cd("0.0")}</InitialTime>
<FinalDate>{cd("1762820105000")}</FinalDate>
<FinalTime>{cd("905.0")}</FinalTime>
</ModelTimeProperties>
<AnimationProperties>
<StopNever>true</StopNever>
<ExecutionMode>realTimeScaled</ExecutionMode>
<RealTimeScale>10.0</RealTimeScale>
<EnableZoomAndPanning>true</EnableZoomAndPanning>
<EnableDeveloperPanel>true</EnableDeveloperPanel>
<ShowDeveloperPanelOnStart>false</ShowDeveloperPanelOnStart>
</AnimationProperties>
<Inputs>
</Inputs>
<Outputs>
</Outputs>
</RunConfiguration>
<Experiments>
<SimulationExperiment ActiveObjectClassId="{main_id}">
<Id>{nid()}</Id>
<Name>{cd("Simulation")}</Name>
<CommandLineArguments>{cd("")}</CommandLineArguments>
<MaximumMemory>2048</MaximumMemory>
<RandomNumberGenerationType>randomSeed</RandomNumberGenerationType>
<CustomGeneratorCode>new Random()</CustomGeneratorCode>
<SeedValue>1</SeedValue>
<SelectionModeForSimultaneousEvents>LIFO</SelectionModeForSimultaneousEvents>
<VmArgs>{cd("")}</VmArgs>
<LoadRootFromSnapshot>false</LoadRootFromSnapshot>
<Presentation>
{text(30, 30, "UFC Agent-Based Model: Kicker vs Boxer", size=24, bold=True)}</Presentation>
<Parameters>
<Parameter>
<ParameterName>{cd("counterWhenHurt")}</ParameterName>
</Parameter>
</Parameters>
<PresentationProperties>
<EnableZoomAndPanning>true</EnableZoomAndPanning>
<ExecutionMode>{cd("realTimeScaled")}</ExecutionMode>
<Title>{cd(title)}</Title>
<EnableDeveloperPanel>true</EnableDeveloperPanel>
<ShowDeveloperPanelOnStart>false</ShowDeveloperPanelOnStart>
<RealTimeScale>10.0</RealTimeScale>
</PresentationProperties>
<ModelTimeProperties>
<StopOption>{cd("Stop at specified time")}</StopOption>
<InitialDate>{cd("1762819200000")}</InitialDate>
<InitialTime>{cd("0.0")}</InitialTime>
<FinalDate>{cd("1762820105000")}</FinalDate>
<FinalTime>{cd("905.0")}</FinalTime>
</ModelTimeProperties>
<BypassInitialScreen>true</BypassInitialScreen>
</SimulationExperiment>
</Experiments>
{resources}<RequiredLibraryReference>
<LibraryName>{cd("com.anylogic.libraries.modules.markup_descriptors")}</LibraryName>
<VersionMajor>1</VersionMajor>
<VersionMinor>0</VersionMinor>
<VersionBuild>0</VersionBuild>
</RequiredLibraryReference>
<CloudModelUuid>{cd(str(uuid.uuid4()))}</CloudModelUuid>
</Model>
<ConvertersApplied>
{"".join(f"<Uuid>{u}</Uuid>" + chr(10) for u in CONVERTERS)}</ConvertersApplied>
</AnyLogicWorkspace>
"""

