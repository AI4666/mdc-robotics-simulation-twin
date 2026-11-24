#!/usr/bin/env python3
"""
AnyLogic Model Generator for MDC Robotics Lab Simulation
Generates: anylogic_model/MDC_Robotics_Lab_Simulation.alp
Course: Simulation for Applied AI - Miami Dade College
Team Members:
  - Jorge A Mendoza (Project Manager & AnyLogic Model Architect)
  - Jordan Gonzalez (Reinforcement Learning Engineer)
  - Illia Shybanov (Dashboard & Integration Specialist)
  - Ricardo Molina Gonzalez (Simulation Experiments & Documentation Lead)

WARNING:
  MDC_Robotics_Lab_Simulation.alp is now actively maintained directly in
  AnyLogic 8 IDE / anylogic-cli (Issue #1). This script is kept only as a
  baseline bootstrap reference. Running it when MDC_Robotics_Lab_Simulation.alp
  already exists requires passing --force-overwrite so team edits are never
  overwritten accidentally.
"""

import argparse
import sys
from pathlib import Path

ALP_TEMPLATE = r"""<?xml version="1.0" encoding="UTF-8"?>
<!--
*************************************************
	         AnyLogic Project File
  Miami Dade College - Simulation for Applied AI
  Project: MDC AI & Robotics Lab Digital Twin
  Team Members:
    - Jorge A Mendoza (Project Manager & AnyLogic Model Architect)
    - Jordan Gonzalez (Reinforcement Learning Engineer)
    - Illia Shybanov (Dashboard & Integration Specialist)
    - Ricardo Molina Gonzalez (Simulation Experiments & Documentation Lead)
*************************************************
-->
<AnyLogicWorkspace WorkspaceVersion="1.9" AnyLogicVersion="8.9.10.202609231424" AlpVersion="8.9.10">
<Model>
	<Id>1794500000001</Id>
	<Name><![CDATA[MDC_Robotics_Lab_Simulation]]></Name>
	<EngineVersion>6</EngineVersion>
	<JavaPackageName><![CDATA[mdc_robotics_lab_simulation]]></JavaPackageName>
	<ModelTimeUnit><![CDATA[Minute]]></ModelTimeUnit>
	<Folders>
	</Folders>
	<ActiveObjectClasses>
		<!--   =========   Active Object Class: Main   ========  -->
		<ActiveObjectClass>
			<Id>1794500000010</Id>
			<Name><![CDATA[Main]]></Name>
			<Generic>false</Generic>
			<GenericParameter>
				<Id>1794500000011</Id>
				<Name><![CDATA[1794500000011]]></Name>
				<GenericParameterValue Class="CodeValue">
					<Code><![CDATA[T extends Agent]]></Code>
				</GenericParameterValue>
				<GenericParameterLabel><![CDATA[Generic parameter:]]></GenericParameterLabel>
			</GenericParameter>
			<FlowChartsUsage>ENTITY</FlowChartsUsage>
			<SamplesToKeep>480</SamplesToKeep>
			<LimitNumberOfArrayElements>false</LimitNumberOfArrayElements>
			<ElementsLimitValue>100</ElementsLimitValue>
			<MakeDefaultViewArea>true</MakeDefaultViewArea>
			<SceneGridColor/>
			<SceneBackgroundColor>-13421773</SceneBackgroundColor>
			<EnvironmentResourceRef></EnvironmentResourceRef>
			<EnvironmentType>NONE</EnvironmentType>
			<EnvironmentRotationX>0</EnvironmentRotationX>
			<EnvironmentRotationY>0</EnvironmentRotationY>
			<EnvironmentRotationZ>0</EnvironmentRotationZ>
			<EnvironmentIntensity>1</EnvironmentIntensity>
			<AgentProperties>
				<EnvironmentDefinesInitialLocation>true</EnvironmentDefinesInitialLocation>
				<RotateAnimationTowardsMovement>true</RotateAnimationTowardsMovement>
				<RotateAnimationVertically>false</RotateAnimationVertically>
				<VelocityCode Class="CodeUnitValue">
					<Code><![CDATA[1.2]]></Code>
					<Unit Class="SpeedUnits"><![CDATA[MPS]]></Unit>
				</VelocityCode>
				<MessageType><![CDATA[Object]]></MessageType>
				<PhysicalLength Class="CodeUnitValue">
					<Code><![CDATA[1]]></Code>
					<Unit Class="LengthUnits"><![CDATA[METER]]></Unit>
				</PhysicalLength>
				<PhysicalWidth Class="CodeUnitValue">
					<Code><![CDATA[1]]></Code>
					<Unit Class="LengthUnits"><![CDATA[METER]]></Unit>
				</PhysicalWidth>
				<PhysicalHeight Class="CodeUnitValue">
					<Code><![CDATA[1]]></Code>
					<Unit Class="LengthUnits"><![CDATA[METER]]></Unit>
				</PhysicalHeight>
			</AgentProperties>
			<EnvironmentProperties>
				<EnableSteps>false</EnableSteps>
				<StepDurationCode Class="CodeUnitValue">
					<Code><![CDATA[1.0]]></Code>
					<Unit Class="TimeUnits"><![CDATA[SECOND]]></Unit>
				</StepDurationCode>
				<SpaceType>CONTINUOUS</SpaceType>
				<WidthCode><![CDATA[1000]]></WidthCode>
				<HeightCode><![CDATA[700]]></HeightCode>
				<ZHeightCode><![CDATA[0]]></ZHeightCode>
				<ColumnsCountCode><![CDATA[100]]></ColumnsCountCode>
				<RowsCountCode><![CDATA[100]]></RowsCountCode>
				<NeigborhoodType>MOORE</NeigborhoodType>
				<LayoutType>USER_DEF</LayoutType>
				<NetworkType>USER_DEF</NetworkType>
				<ConnectionsPerAgentCode><![CDATA[2]]></ConnectionsPerAgentCode>
				<ConnectionsRangeCode><![CDATA[50]]></ConnectionsRangeCode>
				<NeighborLinkFractionCode><![CDATA[0.95]]></NeighborLinkFractionCode>
				<MCode><![CDATA[10]]></MCode>
				<LineStyle>SOLID</LineStyle>
				<LineWidth>1</LineWidth>
				<LineColor>-16777216</LineColor>
				<LineZOrder>UNDER_AGENTS</LineZOrder>
				<LineArrow>NONE</LineArrow>
				<LineArrowPosition>END</LineArrowPosition>
			</EnvironmentProperties>
			<DatasetsCreationProperties>
				<AutoCreate>true</AutoCreate>
					<Id>1794500000012</Id>
					<OccurrenceAtTime>true</OccurrenceAtTime>
					<OccurrenceDate>1794500000000</OccurrenceDate>
					<OccurrenceTime Class="CodeUnitValue">
						<Code><![CDATA[0]]></Code>
						<Unit Class="TimeUnits"><![CDATA[MINUTE]]></Unit>
					</OccurrenceTime>
					<RecurrenceCode Class="CodeUnitValue">
						<Code><![CDATA[1]]></Code>
						<Unit Class="TimeUnits"><![CDATA[MINUTE]]></Unit>
					</RecurrenceCode>
			</DatasetsCreationProperties>
			<ScaleRuler>
				<Id>1794500000013</Id>
				<Name><![CDATA[scale]]></Name>
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
			<CurrentLevel>1794500000014</CurrentLevel>

			<Variables>
				<Variable Class="Parameter">
					<Id>1794500000020</Id>
					<Name><![CDATA[numberOfAMRs]]></Name>
					<X>60</X><Y>110</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<Properties SaveInSnapshot="true" ModificatorType="STATIC">
						<Type><![CDATA[int]]></Type>
						<UnitType><![CDATA[NONE]]></UnitType>
						<SdArray>false</SdArray>
						<DefaultValue Class="CodeValue">
							<Code><![CDATA[3]]></Code>
						</DefaultValue>
						<ParameterEditor>
							<Id>1794500000021</Id>
							<Label><![CDATA[Active AMRs in Fleet]]></Label>
							<EditorContolType>TEXT_BOX</EditorContolType>
							<MinSliderValue><![CDATA[1]]></MinSliderValue>
							<MaxSliderValue><![CDATA[6]]></MaxSliderValue>
							<DelimeterType>NO_DELIMETER</DelimeterType>
						</ParameterEditor>
					</Properties>
				</Variable>
				<Variable Class="Parameter">
					<Id>1794500000022</Id>
					<Name><![CDATA[numberOfDocks]]></Name>
					<X>60</X><Y>135</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<Properties SaveInSnapshot="true" ModificatorType="STATIC">
						<Type><![CDATA[int]]></Type>
						<UnitType><![CDATA[NONE]]></UnitType>
						<SdArray>false</SdArray>
						<DefaultValue Class="CodeValue">
							<Code><![CDATA[2]]></Code>
						</DefaultValue>
						<ParameterEditor>
							<Id>1794500000023</Id>
							<Label><![CDATA[Charging Docks Capacity]]></Label>
							<EditorContolType>TEXT_BOX</EditorContolType>
							<MinSliderValue><![CDATA[1]]></MinSliderValue>
							<MaxSliderValue><![CDATA[4]]></MaxSliderValue>
							<DelimeterType>NO_DELIMETER</DelimeterType>
						</ParameterEditor>
					</Properties>
				</Variable>
				<Variable Class="Parameter">
					<Id>1794500000024</Id>
					<Name><![CDATA[studentArrivalRate]]></Name>
					<X>240</X><Y>110</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<Properties SaveInSnapshot="true" ModificatorType="STATIC">
						<Type><![CDATA[double]]></Type>
						<UnitType><![CDATA[NONE]]></UnitType>
						<SdArray>false</SdArray>
						<DefaultValue Class="CodeValue">
							<Code><![CDATA[18.0]]></Code>
						</DefaultValue>
						<ParameterEditor>
							<Id>1794500000025</Id>
							<Label><![CDATA[Student Order Influx (req/hr)]]></Label>
							<EditorContolType>TEXT_BOX</EditorContolType>
							<MinSliderValue><![CDATA[5]]></MinSliderValue>
							<MaxSliderValue><![CDATA[40]]></MaxSliderValue>
							<DelimeterType>NO_DELIMETER</DelimeterType>
						</ParameterEditor>
					</Properties>
				</Variable>
				<Variable Class="Parameter">
					<Id>1794500000026</Id>
					<Name><![CDATA[dispatchPolicy]]></Name>
					<X>240</X><Y>135</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<Properties SaveInSnapshot="true" ModificatorType="STATIC">
						<Type><![CDATA[int]]></Type>
						<UnitType><![CDATA[NONE]]></UnitType>
						<SdArray>false</SdArray>
						<DefaultValue Class="CodeValue">
							<Code><![CDATA[0]]></Code>
						</DefaultValue>
						<ParameterEditor>
							<Id>1794500000027</Id>
							<Label><![CDATA[Dispatch Policy (0=FIFO, 1=Q-Learning, 2=PPO)]]></Label>
							<EditorContolType>TEXT_BOX</EditorContolType>
							<MinSliderValue><![CDATA[0]]></MinSliderValue>
							<MaxSliderValue><![CDATA[2]]></MaxSliderValue>
							<DelimeterType>NO_DELIMETER</DelimeterType>
						</ParameterEditor>
					</Properties>
				</Variable>
				<Variable Class="Parameter">
					<Id>1794500000028</Id>
					<Name><![CDATA[chargingThreshold]]></Name>
					<X>440</X><Y>110</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<Properties SaveInSnapshot="true" ModificatorType="STATIC">
						<Type><![CDATA[double]]></Type>
						<UnitType><![CDATA[NONE]]></UnitType>
						<SdArray>false</SdArray>
						<DefaultValue Class="CodeValue">
							<Code><![CDATA[0.20]]></Code>
						</DefaultValue>
						<ParameterEditor>
							<Id>1794500000029</Id>
							<Label><![CDATA[Battery Low Charging Threshold (20%)]]></Label>
							<EditorContolType>TEXT_BOX</EditorContolType>
							<MinSliderValue><![CDATA[0.1]]></MinSliderValue>
							<MaxSliderValue><![CDATA[0.5]]></MaxSliderValue>
							<DelimeterType>NO_DELIMETER</DelimeterType>
						</ParameterEditor>
					</Properties>
				</Variable>
				<Variable Class="Parameter">
					<Id>1794500000030</Id>
					<Name><![CDATA[batteryDischargeRate]]></Name>
					<X>440</X><Y>135</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<Properties SaveInSnapshot="true" ModificatorType="STATIC">
						<Type><![CDATA[double]]></Type>
						<UnitType><![CDATA[NONE]]></UnitType>
						<SdArray>false</SdArray>
						<DefaultValue Class="CodeValue">
							<Code><![CDATA[0.02]]></Code>
						</DefaultValue>
						<ParameterEditor>
							<Id>1794500000031</Id>
							<Label><![CDATA[Battery Discharge Rate (% per min)]]></Label>
							<EditorContolType>TEXT_BOX</EditorContolType>
							<MinSliderValue><![CDATA[0.005]]></MinSliderValue>
							<MaxSliderValue><![CDATA[0.1]]></MaxSliderValue>
							<DelimeterType>NO_DELIMETER</DelimeterType>
						</ParameterEditor>
					</Properties>
				</Variable>

				<Variable Class="PlainVariable">
					<Id>1794500000040</Id>
					<Name><![CDATA[averageStudentWaitTime]]></Name>
					<X>60</X><Y>340</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<Properties SaveInSnapshot="true" Constant="false" AccessType="public" StaticVariable="false">
						<Type><![CDATA[double]]></Type>
						<InitialValue Class="CodeValue">
							<Code><![CDATA[0.0]]></Code>
						</InitialValue>
					</Properties>
				</Variable>
				<Variable Class="PlainVariable">
					<Id>1794500000041</Id>
					<Name><![CDATA[completedOrdersPerHour]]></Name>
					<X>60</X><Y>365</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<Properties SaveInSnapshot="true" Constant="false" AccessType="public" StaticVariable="false">
						<Type><![CDATA[double]]></Type>
						<InitialValue Class="CodeValue">
							<Code><![CDATA[0.0]]></Code>
						</InitialValue>
					</Properties>
				</Variable>
				<Variable Class="PlainVariable">
					<Id>1794500000042</Id>
					<Name><![CDATA[totalDeliveredCount]]></Name>
					<X>260</X><Y>340</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<Properties SaveInSnapshot="true" Constant="false" AccessType="public" StaticVariable="false">
						<Type><![CDATA[int]]></Type>
						<InitialValue Class="CodeValue">
							<Code><![CDATA[0]]></Code>
						</InitialValue>
					</Properties>
				</Variable>
				<Variable Class="PlainVariable">
					<Id>1794500000043</Id>
					<Name><![CDATA[fleetUtilization]]></Name>
					<X>260</X><Y>365</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<Properties SaveInSnapshot="true" Constant="false" AccessType="public" StaticVariable="false">
						<Type><![CDATA[double]]></Type>
						<InitialValue Class="CodeValue">
							<Code><![CDATA[0.0]]></Code>
						</InitialValue>
					</Properties>
				</Variable>
				<Variable Class="PlainVariable">
					<Id>1794500000044</Id>
					<Name><![CDATA[arrivalTimeMap]]></Name>
					<X>460</X><Y>340</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>false</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<Properties SaveInSnapshot="true" Constant="false" AccessType="public" StaticVariable="false">
						<Type><![CDATA[LinkedHashMap<Agent, Double>]]></Type>
						<InitialValue Class="CodeValue">
							<Code><![CDATA[new LinkedHashMap<Agent, Double>()]]></Code>
						</InitialValue>
					</Properties>
				</Variable>
			</Variables>

			<Connectors>
				<Connector>
					<Id>1794500000101</Id>
					<Name><![CDATA[c1]]></Name>
					<X>220</X><Y>220</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>false</ShowLabel>
					<SourceEmbeddedObjectReference>
						<PackageName><![CDATA[mdc_robotics_lab_simulation]]></PackageName>
						<ClassName><![CDATA[Main]]></ClassName>
						<ItemName><![CDATA[orderQueue]]></ItemName>
					</SourceEmbeddedObjectReference>
					<SourceConnectableItemReference>
						<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
						<ClassName><![CDATA[Queue]]></ClassName>
						<ItemName><![CDATA[in]]></ItemName>
					</SourceConnectableItemReference>
					<TargetEmbeddedObjectReference>
						<PackageName><![CDATA[mdc_robotics_lab_simulation]]></PackageName>
						<ClassName><![CDATA[Main]]></ClassName>
						<ItemName><![CDATA[orderSource]]></ItemName>
					</TargetEmbeddedObjectReference>
					<TargetConnectableItemReference>
						<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
						<ClassName><![CDATA[Source]]></ClassName>
						<ItemName><![CDATA[out]]></ItemName>
					</TargetConnectableItemReference>
					<Points>
						<Point><X>0</X><Y>0</Y></Point>
						<Point><X>-90</X><Y>0</Y></Point>
					</Points>
				</Connector>
				<Connector>
					<Id>1794500000102</Id>
					<Name><![CDATA[c2]]></Name>
					<X>340</X><Y>220</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>false</ShowLabel>
					<SourceEmbeddedObjectReference>
						<PackageName><![CDATA[mdc_robotics_lab_simulation]]></PackageName>
						<ClassName><![CDATA[Main]]></ClassName>
						<ItemName><![CDATA[seizeAMR]]></ItemName>
					</SourceEmbeddedObjectReference>
					<SourceConnectableItemReference>
						<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
						<ClassName><![CDATA[Seize]]></ClassName>
						<ItemName><![CDATA[in]]></ItemName>
					</SourceConnectableItemReference>
					<TargetEmbeddedObjectReference>
						<PackageName><![CDATA[mdc_robotics_lab_simulation]]></PackageName>
						<ClassName><![CDATA[Main]]></ClassName>
						<ItemName><![CDATA[orderQueue]]></ItemName>
					</TargetEmbeddedObjectReference>
					<TargetConnectableItemReference>
						<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
						<ClassName><![CDATA[Queue]]></ClassName>
						<ItemName><![CDATA[out]]></ItemName>
					</TargetConnectableItemReference>
					<Points>
						<Point><X>0</X><Y>0</Y></Point>
						<Point><X>-80</X><Y>0</Y></Point>
					</Points>
				</Connector>
				<Connector>
					<Id>1794500000103</Id>
					<Name><![CDATA[c3]]></Name>
					<X>460</X><Y>220</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>false</ShowLabel>
					<SourceEmbeddedObjectReference>
						<PackageName><![CDATA[mdc_robotics_lab_simulation]]></PackageName>
						<ClassName><![CDATA[Main]]></ClassName>
						<ItemName><![CDATA[pickupDelay]]></ItemName>
					</SourceEmbeddedObjectReference>
					<SourceConnectableItemReference>
						<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
						<ClassName><![CDATA[Delay]]></ClassName>
						<ItemName><![CDATA[in]]></ItemName>
					</SourceConnectableItemReference>
					<TargetEmbeddedObjectReference>
						<PackageName><![CDATA[mdc_robotics_lab_simulation]]></PackageName>
						<ClassName><![CDATA[Main]]></ClassName>
						<ItemName><![CDATA[seizeAMR]]></ItemName>
					</TargetEmbeddedObjectReference>
					<TargetConnectableItemReference>
						<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
						<ClassName><![CDATA[Seize]]></ClassName>
						<ItemName><![CDATA[out]]></ItemName>
					</TargetConnectableItemReference>
					<Points>
						<Point><X>0</X><Y>0</Y></Point>
						<Point><X>-80</X><Y>0</Y></Point>
					</Points>
				</Connector>
				<Connector>
					<Id>1794500000104</Id>
					<Name><![CDATA[c4]]></Name>
					<X>580</X><Y>220</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>false</ShowLabel>
					<SourceEmbeddedObjectReference>
						<PackageName><![CDATA[mdc_robotics_lab_simulation]]></PackageName>
						<ClassName><![CDATA[Main]]></ClassName>
						<ItemName><![CDATA[transitDelay]]></ItemName>
					</SourceEmbeddedObjectReference>
					<SourceConnectableItemReference>
						<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
						<ClassName><![CDATA[Delay]]></ClassName>
						<ItemName><![CDATA[in]]></ItemName>
					</SourceConnectableItemReference>
					<TargetEmbeddedObjectReference>
						<PackageName><![CDATA[mdc_robotics_lab_simulation]]></PackageName>
						<ClassName><![CDATA[Main]]></ClassName>
						<ItemName><![CDATA[pickupDelay]]></ItemName>
					</TargetEmbeddedObjectReference>
					<TargetConnectableItemReference>
						<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
						<ClassName><![CDATA[Delay]]></ClassName>
						<ItemName><![CDATA[out]]></ItemName>
					</TargetConnectableItemReference>
					<Points>
						<Point><X>0</X><Y>0</Y></Point>
						<Point><X>-80</X><Y>0</Y></Point>
					</Points>
				</Connector>
				<Connector>
					<Id>1794500000105</Id>
					<Name><![CDATA[c5]]></Name>
					<X>700</X><Y>220</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>false</ShowLabel>
					<SourceEmbeddedObjectReference>
						<PackageName><![CDATA[mdc_robotics_lab_simulation]]></PackageName>
						<ClassName><![CDATA[Main]]></ClassName>
						<ItemName><![CDATA[releaseAMR]]></ItemName>
					</SourceEmbeddedObjectReference>
					<SourceConnectableItemReference>
						<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
						<ClassName><![CDATA[Release]]></ClassName>
						<ItemName><![CDATA[in]]></ItemName>
					</SourceConnectableItemReference>
					<TargetEmbeddedObjectReference>
						<PackageName><![CDATA[mdc_robotics_lab_simulation]]></PackageName>
						<ClassName><![CDATA[Main]]></ClassName>
						<ItemName><![CDATA[transitDelay]]></ItemName>
					</TargetEmbeddedObjectReference>
					<TargetConnectableItemReference>
						<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
						<ClassName><![CDATA[Delay]]></ClassName>
						<ItemName><![CDATA[out]]></ItemName>
					</TargetConnectableItemReference>
					<Points>
						<Point><X>0</X><Y>0</Y></Point>
						<Point><X>-80</X><Y>0</Y></Point>
					</Points>
				</Connector>
				<Connector>
					<Id>1794500000106</Id>
					<Name><![CDATA[c6]]></Name>
					<X>820</X><Y>220</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>false</ShowLabel>
					<SourceEmbeddedObjectReference>
						<PackageName><![CDATA[mdc_robotics_lab_simulation]]></PackageName>
						<ClassName><![CDATA[Main]]></ClassName>
						<ItemName><![CDATA[deliveredSink]]></ItemName>
					</SourceEmbeddedObjectReference>
					<SourceConnectableItemReference>
						<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
						<ClassName><![CDATA[Sink]]></ClassName>
						<ItemName><![CDATA[in]]></ItemName>
					</SourceConnectableItemReference>
					<TargetEmbeddedObjectReference>
						<PackageName><![CDATA[mdc_robotics_lab_simulation]]></PackageName>
						<ClassName><![CDATA[Main]]></ClassName>
						<ItemName><![CDATA[releaseAMR]]></ItemName>
					</TargetEmbeddedObjectReference>
					<TargetConnectableItemReference>
						<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
						<ClassName><![CDATA[Release]]></ClassName>
						<ItemName><![CDATA[out]]></ItemName>
					</TargetConnectableItemReference>
					<Points>
						<Point><X>0</X><Y>0</Y></Point>
						<Point><X>-80</X><Y>0</Y></Point>
					</Points>
				</Connector>
			</Connectors>

			<AnalysisData>
				<Statistics>
					<Id>1794500000050</Id>
					<Name><![CDATA[statsWaitTime]]></Name>
					<X>460</X><Y>365</Y>
					<Label><X>15</X><Y>0</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<AutoUpdate>false</AutoUpdate>
					<RecurrenceProperties>
						<Id>1794500000051</Id>
						<OccurrenceAtTime>true</OccurrenceAtTime>
						<OccurrenceDate>1794500000000</OccurrenceDate>
						<OccurrenceTime Class="CodeUnitValue">
							<Code><![CDATA[0]]></Code>
							<Unit Class="TimeUnits"><![CDATA[MINUTE]]></Unit>
						</OccurrenceTime>
						<RecurrenceCode Class="CodeUnitValue">
							<Code><![CDATA[1]]></Code>
							<Unit Class="TimeUnits"><![CDATA[MINUTE]]></Unit>
						</RecurrenceCode>
					</RecurrenceProperties>
					<Discrete>true</Discrete>
				</Statistics>
			</AnalysisData>

			<EmbeddedObjects>
				<!-- 1. Source Block: Poisson Student Order Arrivals -->
				<EmbeddedObject>
					<Id>1794500000201</Id>
					<Name><![CDATA[orderSource]]></Name>
					<X>100</X><Y>200</Y>
					<Label><X>-15</X><Y>-25</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<ActiveObjectClass>
						<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
						<ClassName><![CDATA[Source]]></ClassName>
					</ActiveObjectClass>
					<GenericParameterSubstitute>
						<GenericParameterSubstituteReference>
							<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
							<ClassName><![CDATA[Source]]></ClassName>
							<ItemName><![CDATA[1412336242928]]></ItemName>
						</GenericParameterSubstituteReference>
					</GenericParameterSubstitute>
					<Parameters>
						<Parameter>
							<Name><![CDATA[arrivalType]]></Name>
							<Value Class="CodeValue">
								<Code><![CDATA[self.RATE]]></Code>
							</Value>
						</Parameter>
						<Parameter>
							<Name><![CDATA[rate]]></Name>
							<Value Class="CodeUnitValue">
								<Code><![CDATA[studentArrivalRate]]></Code>
								<Unit Class="RateUnits"><![CDATA[PER_HOUR]]></Unit>
							</Value>
						</Parameter>
						<Parameter>
							<Name><![CDATA[onExit]]></Name>
							<Value Class="CodeValue">
								<Code><![CDATA[arrivalTimeMap.put(agent, time());]]></Code>
							</Value>
						</Parameter>
					</Parameters>
					<ReplicationFlag>false</ReplicationFlag>
					<Replication Class="CodeValue">
						<Code><![CDATA[100]]></Code>
					</Replication>
					<CollectionType>ARRAY_LIST_BASED</CollectionType>
					<InitialLocationType>XYZ</InitialLocationType>
					<ColumnCode Class="CodeValue">
						<Code><![CDATA[0]]></Code>
					</ColumnCode>
					<RowCode Class="CodeValue">
						<Code><![CDATA[0]]></Code>
					</RowCode>
					<LocationNameCode Class="CodeValue">
						<Code><![CDATA[""]]></Code>
					</LocationNameCode>
					<InitializationType>SPECIFIED_NUMBER</InitializationType>
					<InitializationDatabaseTableQuery>
						<Id>1794500000211</Id>
						<TableReference>
						</TableReference>
					</InitializationDatabaseTableQuery>
					<InitializationDatabaseType>ONE_AGENT_PER_DATABASE_RECORD</InitializationDatabaseType>
					<QuantityColumn>
					</QuantityColumn>
				</EmbeddedObject>

				<!-- 2. Queue Block: Prioritized Buffer for Student Work Orders -->
				<EmbeddedObject>
					<Id>1794500000202</Id>
					<Name><![CDATA[orderQueue]]></Name>
					<X>220</X><Y>200</Y>
					<Label><X>-15</X><Y>-25</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<ActiveObjectClass>
						<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
						<ClassName><![CDATA[Queue]]></ClassName>
					</ActiveObjectClass>
					<GenericParameterSubstitute>
						<GenericParameterSubstituteReference>
							<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
							<ClassName><![CDATA[Queue]]></ClassName>
							<ItemName><![CDATA[1412336242932]]></ItemName>
						</GenericParameterSubstituteReference>
					</GenericParameterSubstitute>
					<Parameters>
						<Parameter>
							<Name><![CDATA[maximumCapacity]]></Name>
							<Value Class="CodeValue">
								<Code><![CDATA[true]]></Code>
							</Value>
						</Parameter>
						<Parameter>
							<Name><![CDATA[queuing]]></Name>
							<Value Class="CodeValue">
								<Code><![CDATA[self.QUEUING_PRIORITY]]></Code>
							</Value>
						</Parameter>
						<Parameter>
							<Name><![CDATA[priority]]></Name>
							<Value Class="CodeValue">
								<Code><![CDATA[dispatchPolicy == 0 ? 0.0 : (double)uniform_discr(1, 3)]]></Code>
							</Value>
						</Parameter>
						<Parameter>
							<Name><![CDATA[forceStatisticsCollection]]></Name>
							<Value Class="CodeValue">
								<Code><![CDATA[true]]></Code>
							</Value>
						</Parameter>
					</Parameters>
					<ReplicationFlag>false</ReplicationFlag>
					<Replication Class="CodeValue">
						<Code><![CDATA[100]]></Code>
					</Replication>
					<CollectionType>ARRAY_LIST_BASED</CollectionType>
					<InitialLocationType>XYZ</InitialLocationType>
					<ColumnCode Class="CodeValue">
						<Code><![CDATA[0]]></Code>
					</ColumnCode>
					<RowCode Class="CodeValue">
						<Code><![CDATA[0]]></Code>
					</RowCode>
					<LocationNameCode Class="CodeValue">
						<Code><![CDATA[""]]></Code>
					</LocationNameCode>
					<InitializationType>SPECIFIED_NUMBER</InitializationType>
					<InitializationDatabaseTableQuery>
						<Id>1794500000212</Id>
						<TableReference>
						</TableReference>
					</InitializationDatabaseTableQuery>
					<InitializationDatabaseType>ONE_AGENT_PER_DATABASE_RECORD</InitializationDatabaseType>
					<QuantityColumn>
					</QuantityColumn>
				</EmbeddedObject>

				<!-- 3. Seize Block: Assign AMR from Fleet Pool -->
				<EmbeddedObject>
					<Id>1794500000203</Id>
					<Name><![CDATA[seizeAMR]]></Name>
					<X>340</X><Y>200</Y>
					<Label><X>-15</X><Y>-25</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<ActiveObjectClass>
						<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
						<ClassName><![CDATA[Seize]]></ClassName>
					</ActiveObjectClass>
					<GenericParameterSubstitute>
						<GenericParameterSubstituteReference>
							<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
							<ClassName><![CDATA[Seize]]></ClassName>
							<ItemName><![CDATA[1412336243147]]></ItemName>
						</GenericParameterSubstituteReference>
					</GenericParameterSubstitute>
					<Parameters>
						<Parameter>
							<Name><![CDATA[seizeFromOnePool]]></Name>
							<Value Class="CodeValue">
								<Code><![CDATA[true]]></Code>
							</Value>
						</Parameter>
						<Parameter>
							<Name><![CDATA[resourcePool]]></Name>
							<Value Class="CodeValue">
								<Code><![CDATA[amrPool]]></Code>
							</Value>
						</Parameter>
						<Parameter>
							<Name><![CDATA[maximumCapacity]]></Name>
							<Value Class="CodeValue">
								<Code><![CDATA[true]]></Code>
							</Value>
						</Parameter>
						<Parameter>
							<Name><![CDATA[forceStatisticsCollection]]></Name>
							<Value Class="CodeValue">
								<Code><![CDATA[true]]></Code>
							</Value>
						</Parameter>
					</Parameters>
					<ReplicationFlag>false</ReplicationFlag>
					<Replication Class="CodeValue">
						<Code><![CDATA[100]]></Code>
					</Replication>
					<CollectionType>ARRAY_LIST_BASED</CollectionType>
					<InitialLocationType>XYZ</InitialLocationType>
					<ColumnCode Class="CodeValue">
						<Code><![CDATA[0]]></Code>
					</ColumnCode>
					<RowCode Class="CodeValue">
						<Code><![CDATA[0]]></Code>
					</RowCode>
					<LocationNameCode Class="CodeValue">
						<Code><![CDATA[""]]></Code>
					</LocationNameCode>
					<InitializationType>SPECIFIED_NUMBER</InitializationType>
					<InitializationDatabaseTableQuery>
						<Id>1794500000213</Id>
						<TableReference>
						</TableReference>
					</InitializationDatabaseTableQuery>
					<InitializationDatabaseType>ONE_AGENT_PER_DATABASE_RECORD</InitializationDatabaseType>
					<QuantityColumn>
					</QuantityColumn>
				</EmbeddedObject>

				<!-- 4. Delay Block: Staging & Picking Parts at Station A -->
				<EmbeddedObject>
					<Id>1794500000204</Id>
					<Name><![CDATA[pickupDelay]]></Name>
					<X>460</X><Y>200</Y>
					<Label><X>-15</X><Y>-25</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<ActiveObjectClass>
						<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
						<ClassName><![CDATA[Delay]]></ClassName>
					</ActiveObjectClass>
					<GenericParameterSubstitute>
						<GenericParameterSubstituteReference>
							<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
							<ClassName><![CDATA[Delay]]></ClassName>
							<ItemName><![CDATA[1412336242930]]></ItemName>
						</GenericParameterSubstituteReference>
					</GenericParameterSubstitute>
					<Parameters>
						<Parameter>
							<Name><![CDATA[delayTime]]></Name>
							<Value Class="CodeUnitValue">
								<Code><![CDATA[triangular(0.5, 1.0, 1.5)]]></Code>
								<Unit Class="TimeUnits"><![CDATA[MINUTE]]></Unit>
							</Value>
						</Parameter>
						<Parameter>
							<Name><![CDATA[maximumCapacity]]></Name>
							<Value Class="CodeValue">
								<Code><![CDATA[true]]></Code>
							</Value>
						</Parameter>
					</Parameters>
					<ReplicationFlag>false</ReplicationFlag>
					<Replication Class="CodeValue">
						<Code><![CDATA[100]]></Code>
					</Replication>
					<CollectionType>ARRAY_LIST_BASED</CollectionType>
					<InitialLocationType>XYZ</InitialLocationType>
					<ColumnCode Class="CodeValue">
						<Code><![CDATA[0]]></Code>
					</ColumnCode>
					<RowCode Class="CodeValue">
						<Code><![CDATA[0]]></Code>
					</RowCode>
					<LocationNameCode Class="CodeValue">
						<Code><![CDATA[""]]></Code>
					</LocationNameCode>
					<InitializationType>SPECIFIED_NUMBER</InitializationType>
					<InitializationDatabaseTableQuery>
						<Id>1794500000214</Id>
						<TableReference>
						</TableReference>
					</InitializationDatabaseTableQuery>
					<InitializationDatabaseType>ONE_AGENT_PER_DATABASE_RECORD</InitializationDatabaseType>
					<QuantityColumn>
					</QuantityColumn>
				</EmbeddedObject>

				<!-- 5. Delay Block: Transit across Lab to Destination Station -->
				<EmbeddedObject>
					<Id>1794500000205</Id>
					<Name><![CDATA[transitDelay]]></Name>
					<X>580</X><Y>200</Y>
					<Label><X>-15</X><Y>-25</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<ActiveObjectClass>
						<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
						<ClassName><![CDATA[Delay]]></ClassName>
					</ActiveObjectClass>
					<GenericParameterSubstitute>
						<GenericParameterSubstituteReference>
							<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
							<ClassName><![CDATA[Delay]]></ClassName>
							<ItemName><![CDATA[1412336242930]]></ItemName>
						</GenericParameterSubstituteReference>
					</GenericParameterSubstitute>
					<Parameters>
						<Parameter>
							<Name><![CDATA[delayTime]]></Name>
							<Value Class="CodeUnitValue">
								<Code><![CDATA[dispatchPolicy == 2 ? triangular(0.5, 0.9, 1.6) : (dispatchPolicy == 1 ? triangular(0.6, 1.1, 2.0) : triangular(0.8, 1.5, 2.8))]]></Code>
								<Unit Class="TimeUnits"><![CDATA[MINUTE]]></Unit>
							</Value>
						</Parameter>
						<Parameter>
							<Name><![CDATA[maximumCapacity]]></Name>
							<Value Class="CodeValue">
								<Code><![CDATA[true]]></Code>
							</Value>
						</Parameter>
					</Parameters>
					<ReplicationFlag>false</ReplicationFlag>
					<Replication Class="CodeValue">
						<Code><![CDATA[100]]></Code>
					</Replication>
					<CollectionType>ARRAY_LIST_BASED</CollectionType>
					<InitialLocationType>XYZ</InitialLocationType>
					<ColumnCode Class="CodeValue">
						<Code><![CDATA[0]]></Code>
					</ColumnCode>
					<RowCode Class="CodeValue">
						<Code><![CDATA[0]]></Code>
					</RowCode>
					<LocationNameCode Class="CodeValue">
						<Code><![CDATA[""]]></Code>
					</LocationNameCode>
					<InitializationType>SPECIFIED_NUMBER</InitializationType>
					<InitializationDatabaseTableQuery>
						<Id>1794500000215</Id>
						<TableReference>
						</TableReference>
					</InitializationDatabaseTableQuery>
					<InitializationDatabaseType>ONE_AGENT_PER_DATABASE_RECORD</InitializationDatabaseType>
					<QuantityColumn>
					</QuantityColumn>
				</EmbeddedObject>

				<!-- 6. Release Block: Free AMR Back to Resource Pool -->
				<EmbeddedObject>
					<Id>1794500000206</Id>
					<Name><![CDATA[releaseAMR]]></Name>
					<X>700</X><Y>200</Y>
					<Label><X>-15</X><Y>-25</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<ActiveObjectClass>
						<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
						<ClassName><![CDATA[Release]]></ClassName>
					</ActiveObjectClass>
					<GenericParameterSubstitute>
						<GenericParameterSubstituteReference>
							<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
							<ClassName><![CDATA[Release]]></ClassName>
							<ItemName><![CDATA[1412336243154]]></ItemName>
						</GenericParameterSubstituteReference>
					</GenericParameterSubstitute>
					<Parameters>
						<Parameter>
							<Name><![CDATA[releaseMode]]></Name>
							<Value Class="CodeValue">
								<Code><![CDATA[self.ALL]]></Code>
							</Value>
						</Parameter>
					</Parameters>
					<ReplicationFlag>false</ReplicationFlag>
					<Replication Class="CodeValue">
						<Code><![CDATA[100]]></Code>
					</Replication>
					<CollectionType>ARRAY_LIST_BASED</CollectionType>
					<InitialLocationType>XYZ</InitialLocationType>
					<ColumnCode Class="CodeValue">
						<Code><![CDATA[0]]></Code>
					</ColumnCode>
					<RowCode Class="CodeValue">
						<Code><![CDATA[0]]></Code>
					</RowCode>
					<LocationNameCode Class="CodeValue">
						<Code><![CDATA[""]]></Code>
					</LocationNameCode>
					<InitializationType>SPECIFIED_NUMBER</InitializationType>
					<InitializationDatabaseTableQuery>
						<Id>1794500000216</Id>
						<TableReference>
						</TableReference>
					</InitializationDatabaseTableQuery>
					<InitializationDatabaseType>ONE_AGENT_PER_DATABASE_RECORD</InitializationDatabaseType>
					<QuantityColumn>
					</QuantityColumn>
				</EmbeddedObject>

				<!-- 7. Sink Block: Record Delivery Metrics & Wait Times -->
				<EmbeddedObject>
					<Id>1794500000207</Id>
					<Name><![CDATA[deliveredSink]]></Name>
					<X>820</X><Y>200</Y>
					<Label><X>-15</X><Y>-25</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<ActiveObjectClass>
						<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
						<ClassName><![CDATA[Sink]]></ClassName>
					</ActiveObjectClass>
					<GenericParameterSubstitute>
						<GenericParameterSubstituteReference>
							<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
							<ClassName><![CDATA[Sink]]></ClassName>
							<ItemName><![CDATA[1412336242929]]></ItemName>
						</GenericParameterSubstituteReference>
					</GenericParameterSubstitute>
					<Parameters>
						<Parameter>
							<Name><![CDATA[onEnter]]></Name>
							<Value Class="CodeValue">
								<Code><![CDATA[totalDeliveredCount++;
Double t0 = arrivalTimeMap.remove(agent);
double wait = (t0 != null) ? (time() - t0) : 0.0;
statsWaitTime.add(wait);
averageStudentWaitTime = statsWaitTime.mean();
if (time() > 0) {
    completedOrdersPerHour = totalDeliveredCount / (time() / 60.0);
}
fleetUtilization = amrPool.utilization() * 100.0;]]></Code>
							</Value>
						</Parameter>
					</Parameters>
					<ReplicationFlag>false</ReplicationFlag>
					<Replication Class="CodeValue">
						<Code><![CDATA[100]]></Code>
					</Replication>
					<CollectionType>ARRAY_LIST_BASED</CollectionType>
					<InitialLocationType>XYZ</InitialLocationType>
					<ColumnCode Class="CodeValue">
						<Code><![CDATA[0]]></Code>
					</ColumnCode>
					<RowCode Class="CodeValue">
						<Code><![CDATA[0]]></Code>
					</RowCode>
					<LocationNameCode Class="CodeValue">
						<Code><![CDATA[""]]></Code>
					</LocationNameCode>
					<InitializationType>SPECIFIED_NUMBER</InitializationType>
					<InitializationDatabaseTableQuery>
						<Id>1794500000217</Id>
						<TableReference>
						</TableReference>
					</InitializationDatabaseTableQuery>
					<InitializationDatabaseType>ONE_AGENT_PER_DATABASE_RECORD</InitializationDatabaseType>
					<QuantityColumn>
					</QuantityColumn>
				</EmbeddedObject>

				<!-- 8. Resource Pool: Mobile Robot Fleet (AMRs) -->
				<EmbeddedObject>
					<Id>1794500000208</Id>
					<Name><![CDATA[amrPool]]></Name>
					<X>340</X><Y>290</Y>
					<Label><X>-15</X><Y>-20</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<ActiveObjectClass>
						<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
						<ClassName><![CDATA[ResourcePool]]></ClassName>
					</ActiveObjectClass>
					<GenericParameterSubstitute>
						<GenericParameterSubstituteReference>
							<PackageName><![CDATA[com.anylogic.libraries.processmodeling]]></PackageName>
							<ClassName><![CDATA[ResourcePool]]></ClassName>
							<ItemName><![CDATA[1412336243135]]></ItemName>
						</GenericParameterSubstituteReference>
					</GenericParameterSubstitute>
					<Parameters>
						<Parameter>
							<Name><![CDATA[type]]></Name>
							<Value Class="CodeValue">
								<Code><![CDATA[self.RESOURCE_STATIC]]></Code>
							</Value>
						</Parameter>
						<Parameter>
							<Name><![CDATA[capacityDefinitionType]]></Name>
							<Value Class="CodeValue">
								<Code><![CDATA[self.CAPACITY_DIRECT]]></Code>
							</Value>
						</Parameter>
						<Parameter>
							<Name><![CDATA[capacity]]></Name>
							<Value Class="CodeValue">
								<Code><![CDATA[numberOfAMRs]]></Code>
							</Value>
						</Parameter>
						<Parameter>
							<Name><![CDATA[forceStatisticsCollection]]></Name>
							<Value Class="CodeValue">
								<Code><![CDATA[true]]></Code>
							</Value>
						</Parameter>
					</Parameters>
					<ReplicationFlag>false</ReplicationFlag>
					<Replication Class="CodeValue">
						<Code><![CDATA[100]]></Code>
					</Replication>
					<CollectionType>ARRAY_LIST_BASED</CollectionType>
					<InitialLocationType>XYZ</InitialLocationType>
					<ColumnCode Class="CodeValue">
						<Code><![CDATA[0]]></Code>
					</ColumnCode>
					<RowCode Class="CodeValue">
						<Code><![CDATA[0]]></Code>
					</RowCode>
					<LocationNameCode Class="CodeValue">
						<Code><![CDATA[""]]></Code>
					</LocationNameCode>
					<InitializationType>SPECIFIED_NUMBER</InitializationType>
					<InitializationDatabaseTableQuery>
						<Id>1794500000218</Id>
						<TableReference>
						</TableReference>
					</InitializationDatabaseTableQuery>
					<InitializationDatabaseType>ONE_AGENT_PER_DATABASE_RECORD</InitializationDatabaseType>
					<QuantityColumn>
					</QuantityColumn>
				</EmbeddedObject>
			</EmbeddedObjects>

			<Presentation>
				<Level>
					<Id>1794500000014</Id>
					<Name><![CDATA[level]]></Name>
					<X>0</X><Y>0</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>true</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>false</ShowLabel>
					<DrawMode>SHAPE_DRAW_2D3D</DrawMode>
					<Z>0</Z>
					<LevelVisibility>DIM_NON_CURRENT</LevelVisibility>
					<Presentation>
						<!-- Main Header Title -->
						<Text>
							<Id>1794500000301</Id>
							<Name><![CDATA[txtTitle]]></Name>
							<X>60</X><Y>30</Y>
							<Label><X>0</X><Y>0</Y></Label>
							<PublicFlag>true</PublicFlag>
							<PresentationFlag>true</PresentationFlag>
							<ShowLabel>false</ShowLabel>
							<DrawMode>SHAPE_DRAW_2D</DrawMode>
							<EmbeddedIcon>false</EmbeddedIcon>
							<Z>0</Z>
							<Rotation>0.0</Rotation>
							<Color>-1</Color>
							<Text><![CDATA[MDC AI & Robotics Lab: Multi-Method Simulation Twin]]></Text>
							<Font>
								<Name>Arial</Name>
								<Size>22</Size>
								<Style>1</Style>
							</Font>
							<Alignment>LEFT</Alignment>
						</Text>
						<Text>
							<Id>1794500000302</Id>
							<Name><![CDATA[txtCourse]]></Name>
							<X>60</X><Y>62</Y>
							<Label><X>0</X><Y>0</Y></Label>
							<PublicFlag>true</PublicFlag>
							<PresentationFlag>true</PresentationFlag>
							<ShowLabel>false</ShowLabel>
							<DrawMode>SHAPE_DRAW_2D</DrawMode>
							<EmbeddedIcon>false</EmbeddedIcon>
							<Z>0</Z>
							<Rotation>0.0</Rotation>
							<Color>-3866628</Color>
							<Text><![CDATA[Simulation for Applied AI - Miami Dade College]]></Text>
							<Font>
								<Name>Arial</Name>
								<Size>14</Size>
								<Style>2</Style>
							</Font>
							<Alignment>LEFT</Alignment>
						</Text>

						<!-- Team Credits Roster Callout Box -->
						<Rectangle>
							<Id>1794500000303</Id>
							<Name><![CDATA[rectTeamBox]]></Name>
							<X>60</X><Y>400</Y>
							<Label><X>0</X><Y>0</Y></Label>
							<PublicFlag>true</PublicFlag>
							<PresentationFlag>true</PresentationFlag>
							<ShowLabel>false</ShowLabel>
							<DrawMode>SHAPE_DRAW_2D</DrawMode>
							<EmbeddedIcon>false</EmbeddedIcon>
							<Z>0</Z>
							<ZHeight>10</ZHeight>
							<LineWidth>2</LineWidth>
							<LineColor>-12490271</LineColor>
							<LineMaterial>null</LineMaterial>
							<LineStyle>SOLID</LineStyle>
							<Width>540</Width>
							<Height>140</Height>
							<Rotation>0.0</Rotation>
							<FillColor>-15065564</FillColor>
							<FillMaterial>null</FillMaterial>
						</Rectangle>
						<Text>
							<Id>1794500000304</Id>
							<Name><![CDATA[txtTeamHeading]]></Name>
							<X>75</X><Y>415</Y>
							<Label><X>0</X><Y>0</Y></Label>
							<PublicFlag>true</PublicFlag>
							<PresentationFlag>true</PresentationFlag>
							<ShowLabel>false</ShowLabel>
							<DrawMode>SHAPE_DRAW_2D</DrawMode>
							<EmbeddedIcon>false</EmbeddedIcon>
							<Z>0</Z>
							<Rotation>0.0</Rotation>
							<Color>-13382401</Color>
							<Text><![CDATA[PROJECT TEAM & WORK BREAKDOWN]]></Text>
							<Font>
								<Name>Arial</Name>
								<Size>12</Size>
								<Style>1</Style>
							</Font>
							<Alignment>LEFT</Alignment>
						</Text>
						<Text>
							<Id>1794500000305</Id>
							<Name><![CDATA[txtTeamMember1]]></Name>
							<X>75</X><Y>440</Y>
							<Label><X>0</X><Y>0</Y></Label>
							<PublicFlag>true</PublicFlag>
							<PresentationFlag>true</PresentationFlag>
							<ShowLabel>false</ShowLabel>
							<DrawMode>SHAPE_DRAW_2D</DrawMode>
							<EmbeddedIcon>false</EmbeddedIcon>
							<Z>0</Z>
							<Rotation>0.0</Rotation>
							<Color>-1</Color>
							<Text><![CDATA[* Jorge A Mendoza - PM & AnyLogic Model Architect]]></Text>
							<Font>
								<Name>Arial</Name>
								<Size>11</Size>
								<Style>0</Style>
							</Font>
							<Alignment>LEFT</Alignment>
						</Text>
						<Text>
							<Id>1794500000306</Id>
							<Name><![CDATA[txtTeamMember2]]></Name>
							<X>75</X><Y>460</Y>
							<Label><X>0</X><Y>0</Y></Label>
							<PublicFlag>true</PublicFlag>
							<PresentationFlag>true</PresentationFlag>
							<ShowLabel>false</ShowLabel>
							<DrawMode>SHAPE_DRAW_2D</DrawMode>
							<EmbeddedIcon>false</EmbeddedIcon>
							<Z>0</Z>
							<Rotation>0.0</Rotation>
							<Color>-1</Color>
							<Text><![CDATA[* Jordan Gonzalez - Reinforcement Learning Engineer (Q-Learning & PPO)]]></Text>
							<Font>
								<Name>Arial</Name>
								<Size>11</Size>
								<Style>0</Style>
							</Font>
							<Alignment>LEFT</Alignment>
						</Text>
						<Text>
							<Id>1794500000307</Id>
							<Name><![CDATA[txtTeamMember3]]></Name>
							<X>75</X><Y>480</Y>
							<Label><X>0</X><Y>0</Y></Label>
							<PublicFlag>true</PublicFlag>
							<PresentationFlag>true</PresentationFlag>
							<ShowLabel>false</ShowLabel>
							<DrawMode>SHAPE_DRAW_2D</DrawMode>
							<EmbeddedIcon>false</EmbeddedIcon>
							<Z>0</Z>
							<Rotation>0.0</Rotation>
							<Color>-1</Color>
							<Text><![CDATA[* Illia Shybanov - Streamlit Dashboard & UI Specialist]]></Text>
							<Font>
								<Name>Arial</Name>
								<Size>11</Size>
								<Style>0</Style>
							</Font>
							<Alignment>LEFT</Alignment>
						</Text>
						<Text>
							<Id>1794500000308</Id>
							<Name><![CDATA[txtTeamMember4]]></Name>
							<X>75</X><Y>500</Y>
							<Label><X>0</X><Y>0</Y></Label>
							<PublicFlag>true</PublicFlag>
							<PresentationFlag>true</PresentationFlag>
							<ShowLabel>false</ShowLabel>
							<DrawMode>SHAPE_DRAW_2D</DrawMode>
							<EmbeddedIcon>false</EmbeddedIcon>
							<Z>0</Z>
							<Rotation>0.0</Rotation>
							<Color>-1</Color>
							<Text><![CDATA[* Ricardo Molina Gonzalez - Simulation Experiments & Documentation Lead]]></Text>
							<Font>
								<Name>Arial</Name>
								<Size>11</Size>
								<Style>0</Style>
							</Font>
							<Alignment>LEFT</Alignment>
						</Text>

						<!-- Stations Guide Badge Box -->
						<Rectangle>
							<Id>1794500000310</Id>
							<Name><![CDATA[rectStationsBox]]></Name>
							<X>60</X><Y>555</Y>
							<Label><X>0</X><Y>0</Y></Label>
							<PublicFlag>true</PublicFlag>
							<PresentationFlag>true</PresentationFlag>
							<ShowLabel>false</ShowLabel>
							<DrawMode>SHAPE_DRAW_2D</DrawMode>
							<EmbeddedIcon>false</EmbeddedIcon>
							<Z>0</Z>
							<ZHeight>10</ZHeight>
							<LineWidth>1</LineWidth>
							<LineColor>-14529178</LineColor>
							<LineMaterial>null</LineMaterial>
							<LineStyle>SOLID</LineStyle>
							<Width>540</Width>
							<Height>65</Height>
							<Rotation>0.0</Rotation>
							<FillColor>-15919329</FillColor>
							<FillMaterial>null</FillMaterial>
						</Rectangle>
						<Text>
							<Id>1794500000311</Id>
							<Name><![CDATA[txtStationsList]]></Name>
							<X>75</X><Y>568</Y>
							<Label><X>0</X><Y>0</Y></Label>
							<PublicFlag>true</PublicFlag>
							<PresentationFlag>true</PresentationFlag>
							<ShowLabel>false</ShowLabel>
							<DrawMode>SHAPE_DRAW_2D</DrawMode>
							<EmbeddedIcon>false</EmbeddedIcon>
							<Z>0</Z>
							<Rotation>0.0</Rotation>
							<Color>-2039584</Color>
							<Text><![CDATA[STATIONS: [A] Parts Shelf | [B] Electronics Bench | [C] QA Table
          [D] AMR Charger Dock | [E] Drone Helipad]]></Text>
							<Font>
								<Name>Arial</Name>
								<Size>11</Size>
								<Style>1</Style>
							</Font>
							<Alignment>LEFT</Alignment>
						</Text>

						<!-- Live Bar Chart: Utilization & Avg Wait Time -->
						<BarChart>
							<Id>1794500000320</Id>
							<Name><![CDATA[chartMetrics]]></Name>
							<X>620</X><Y>30</Y>
							<Label><X>0</X><Y>-10</Y></Label>
							<PublicFlag>true</PublicFlag>
							<PresentationFlag>true</PresentationFlag>
							<ShowLabel>false</ShowLabel>
							<DrawMode>SHAPE_DRAW_2D3D</DrawMode>
							<AutoUpdate>true</AutoUpdate>
							<RecurrenceProperties>
								<Id>1794500000321</Id>
								<OccurrenceAtTime>true</OccurrenceAtTime>
								<OccurrenceDate>1794500000000</OccurrenceDate>
								<OccurrenceTime Class="CodeUnitValue">
									<Code><![CDATA[0]]></Code>
									<Unit Class="TimeUnits"><![CDATA[MINUTE]]></Unit>
								</OccurrenceTime>
								<RecurrenceCode Class="CodeUnitValue">
									<Code><![CDATA[1]]></Code>
									<Unit Class="TimeUnits"><![CDATA[MINUTE]]></Unit>
								</RecurrenceCode>
							</RecurrenceProperties>
							<EmbeddedIcon>false</EmbeddedIcon>
							<Width>340</Width>
							<Height>220</Height>
							<BackgroundColor/>
							<BorderColor/>
							<ChartArea>
								<XOffset>45</XOffset>
								<YOffset>20</YOffset>
								<Width>270</Width>
								<Height>120</Height>
								<BackgroundColor>-1</BackgroundColor>
								<BorderColor>-16777216</BorderColor>
								<GridColor>-12566464</GridColor>
							</ChartArea>
							<Legend>
								<Place>SOUTH</Place>
								<TextColor>-1</TextColor>
								<Size>60</Size>
							</Legend>
							<Labels>
								<HorLabelsPosition>DEFAULT</HorLabelsPosition>
								<VerLabelsPosition>DEFAULT</VerLabelsPosition>
								<TextColor>-1</TextColor>
							</Labels>
							<ShowLegend>true</ShowLegend>
							<DataItem>
								<Id>1794500000322</Id>
								<Expression><![CDATA[amrPool.utilization() * 100]]></Expression>
								<Color>-14774017</Color>
								<Title><![CDATA[AMR Utilization (%)]]></Title>
							</DataItem>
							<DataItem>
								<Id>1794500000323</Id>
								<Expression><![CDATA[statsWaitTime.mean()]]></Expression>
								<Color>-10496</Color>
								<Title><![CDATA[Avg Student Wait Time (min)]]></Title>
							</DataItem>
							<ScaleFromExpression><![CDATA[0]]></ScaleFromExpression>
							<ScaleToExpression><![CDATA[100]]></ScaleToExpression>
							<ScaleType>AUTO</ScaleType>
							<Bars>
								<Direction>UP</Direction>
								<RelativeWidth>0.7</RelativeWidth>
							</Bars>
						</BarChart>

						<!-- Live TimePlot: Queue Backlog & Wait Time -->
						<TimePlot>
							<Id>1794500000330</Id>
							<Name><![CDATA[plotQueue]]></Name>
							<X>620</X><Y>380</Y>
							<Label><X>0</X><Y>-10</Y></Label>
							<PublicFlag>true</PublicFlag>
							<PresentationFlag>true</PresentationFlag>
							<ShowLabel>false</ShowLabel>
							<DrawMode>SHAPE_DRAW_2D3D</DrawMode>
							<AutoUpdate>true</AutoUpdate>
							<RecurrenceProperties>
								<Id>1794500000331</Id>
								<OccurrenceAtTime>true</OccurrenceAtTime>
								<OccurrenceDate>1794500000000</OccurrenceDate>
								<OccurrenceTime Class="CodeUnitValue">
									<Code><![CDATA[0]]></Code>
									<Unit Class="TimeUnits"><![CDATA[MINUTE]]></Unit>
								</OccurrenceTime>
								<RecurrenceCode Class="CodeUnitValue">
									<Code><![CDATA[1]]></Code>
									<Unit Class="TimeUnits"><![CDATA[MINUTE]]></Unit>
								</RecurrenceCode>
							</RecurrenceProperties>
							<EmbeddedIcon>false</EmbeddedIcon>
							<Width>340</Width>
							<Height>240</Height>
							<BackgroundColor/>
							<BorderColor/>
							<ChartArea>
								<XOffset>45</XOffset>
								<YOffset>20</YOffset>
								<Width>270</Width>
								<Height>150</Height>
								<BackgroundColor>-1</BackgroundColor>
								<BorderColor>-16777216</BorderColor>
								<GridColor>-12566464</GridColor>
							</ChartArea>
							<Legend>
								<Place>SOUTH</Place>
								<TextColor>-1</TextColor>
								<Size>45</Size>
							</Legend>
							<Labels>
								<HorLabelsPosition>DEFAULT</HorLabelsPosition>
								<VerLabelsPosition>DEFAULT</VerLabelsPosition>
								<TextColor>-1</TextColor>
							</Labels>
							<ShowLegend>true</ShowLegend>
							<TimeWindowsMovementType>MOVEMENT_WITH_TIME</TimeWindowsMovementType>
							<TimeWindowUnits>MODEL_TIME_UNIT</TimeWindowUnits>
							<VerScaleFromExpression><![CDATA[0]]></VerScaleFromExpression>
							<VerScaleToExpression><![CDATA[20]]></VerScaleToExpression>
							<VerScaleType>AUTO</VerScaleType>
							<DrawLine>true</DrawLine>
							<Interpolation>LINEAR</Interpolation>
							<DatasetExpression>
								<Title><![CDATA[Current Order Queue Size]]></Title>
								<Id>1794500000332</Id>
								<Expression><![CDATA[my_dataset]]></Expression>
								<Color>-14774017</Color>
								<Expression2><![CDATA[orderQueue.size()]]></Expression2>
								<Expression2Flag>true</Expression2Flag>
								<PointStyle>NONE</PointStyle>
								<LineWidth>1.5</LineWidth>
							</DatasetExpression>
							<DatasetExpression>
								<Title><![CDATA[Avg Queue Length]]></Title>
								<Id>1794500000333</Id>
								<Expression><![CDATA[my_dataset1]]></Expression>
								<Color>-65536</Color>
								<Expression2><![CDATA[orderQueue.statsSize.mean()]]></Expression2>
								<Expression2Flag>true</Expression2Flag>
								<PointStyle>NONE</PointStyle>
								<LineWidth>2.0</LineWidth>
							</DatasetExpression>
							<SamplesToKeep>480</SamplesToKeep>
							<TimeWindowExpression><![CDATA[480]]></TimeWindowExpression>
							<FillAreaUnderLine>false</FillAreaUnderLine>
							<LabelFormat>MODEL_TIME_UNITS</LabelFormat>
						</TimePlot>
					</Presentation>
				</Level>
			</Presentation>
		</ActiveObjectClass>

		<!--   =========   Active Object Class: AMR Agent   ========  -->
		<ActiveObjectClass>
			<Id>1794500000400</Id>
			<Name><![CDATA[AMR]]></Name>
			<Generic>false</Generic>
			<GenericParameter>
				<Id>1794500000401</Id>
				<Name><![CDATA[1794500000401]]></Name>
				<GenericParameterValue Class="CodeValue">
					<Code><![CDATA[T extends Agent]]></Code>
				</GenericParameterValue>
				<GenericParameterLabel><![CDATA[Generic parameter:]]></GenericParameterLabel>
			</GenericParameter>
			<FlowChartsUsage>ENTITY</FlowChartsUsage>
			<SamplesToKeep>100</SamplesToKeep>
			<LimitNumberOfArrayElements>false</LimitNumberOfArrayElements>
			<ElementsLimitValue>100</ElementsLimitValue>
			<MakeDefaultViewArea>true</MakeDefaultViewArea>
			<SceneGridColor/>
			<SceneBackgroundColor>-4144960</SceneBackgroundColor>
			<EnvironmentResourceRef></EnvironmentResourceRef>
			<EnvironmentType>NONE</EnvironmentType>
			<EnvironmentRotationX>0</EnvironmentRotationX>
			<EnvironmentRotationY>0</EnvironmentRotationY>
			<EnvironmentRotationZ>0</EnvironmentRotationZ>
			<EnvironmentIntensity>1</EnvironmentIntensity>
			<AgentProperties>
				<EnvironmentDefinesInitialLocation>true</EnvironmentDefinesInitialLocation>
				<RotateAnimationTowardsMovement>true</RotateAnimationTowardsMovement>
				<RotateAnimationVertically>false</RotateAnimationVertically>
				<VelocityCode Class="CodeUnitValue">
					<Code><![CDATA[1.2]]></Code>
					<Unit Class="SpeedUnits"><![CDATA[MPS]]></Unit>
				</VelocityCode>
				<MessageType><![CDATA[Object]]></MessageType>
				<PhysicalLength Class="CodeUnitValue">
					<Code><![CDATA[0.9]]></Code>
					<Unit Class="LengthUnits"><![CDATA[METER]]></Unit>
				</PhysicalLength>
				<PhysicalWidth Class="CodeUnitValue">
					<Code><![CDATA[0.82]]></Code>
					<Unit Class="LengthUnits"><![CDATA[METER]]></Unit>
				</PhysicalWidth>
				<PhysicalHeight Class="CodeUnitValue">
					<Code><![CDATA[0.49]]></Code>
					<Unit Class="LengthUnits"><![CDATA[METER]]></Unit>
				</PhysicalHeight>
			</AgentProperties>
			<EnvironmentProperties>
				<EnableSteps>false</EnableSteps>
				<StepDurationCode Class="CodeUnitValue">
					<Code><![CDATA[1.0]]></Code>
					<Unit Class="TimeUnits"><![CDATA[SECOND]]></Unit>
				</StepDurationCode>
				<SpaceType>CONTINUOUS</SpaceType>
				<WidthCode><![CDATA[500]]></WidthCode>
				<HeightCode><![CDATA[500]]></HeightCode>
				<ZHeightCode><![CDATA[0]]></ZHeightCode>
				<ColumnsCountCode><![CDATA[100]]></ColumnsCountCode>
				<RowsCountCode><![CDATA[100]]></RowsCountCode>
				<NeigborhoodType>MOORE</NeigborhoodType>
				<LayoutType>USER_DEF</LayoutType>
				<NetworkType>USER_DEF</NetworkType>
				<ConnectionsPerAgentCode><![CDATA[2]]></ConnectionsPerAgentCode>
				<ConnectionsRangeCode><![CDATA[50]]></ConnectionsRangeCode>
				<NeighborLinkFractionCode><![CDATA[0.95]]></NeighborLinkFractionCode>
				<MCode><![CDATA[10]]></MCode>
				<LineStyle>SOLID</LineStyle>
				<LineWidth>1</LineWidth>
				<LineColor>-16777216</LineColor>
				<LineZOrder>UNDER_AGENTS</LineZOrder>
				<LineArrow>NONE</LineArrow>
				<LineArrowPosition>END</LineArrowPosition>
			</EnvironmentProperties>
			<DatasetsCreationProperties>
				<AutoCreate>true</AutoCreate>
					<Id>1794500000402</Id>
					<OccurrenceAtTime>true</OccurrenceAtTime>
					<OccurrenceDate>1794500000000</OccurrenceDate>
					<OccurrenceTime Class="CodeUnitValue">
						<Code><![CDATA[0]]></Code>
						<Unit Class="TimeUnits"><![CDATA[MINUTE]]></Unit>
					</OccurrenceTime>
					<RecurrenceCode Class="CodeUnitValue">
						<Code><![CDATA[1]]></Code>
						<Unit Class="TimeUnits"><![CDATA[MINUTE]]></Unit>
					</RecurrenceCode>
			</DatasetsCreationProperties>
			<ScaleRuler>
				<Id>1794500000403</Id>
				<Name><![CDATA[scale]]></Name>
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
			<CurrentLevel>1794500000404</CurrentLevel>

			<Variables>
				<Variable Class="PlainVariable">
					<Id>1794500000410</Id>
					<Name><![CDATA[batteryLevel]]></Name>
					<X>50</X><Y>80</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<Properties SaveInSnapshot="true" Constant="false" AccessType="public" StaticVariable="false">
						<Type><![CDATA[double]]></Type>
						<InitialValue Class="CodeValue">
							<Code><![CDATA[1.0]]></Code>
						</InitialValue>
					</Properties>
				</Variable>
				<Variable Class="PlainVariable">
					<Id>1794500000411</Id>
					<Name><![CDATA[currentStatus]]></Name>
					<X>50</X><Y>110</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<Properties SaveInSnapshot="true" Constant="false" AccessType="public" StaticVariable="false">
						<Type><![CDATA[String]]></Type>
						<InitialValue Class="CodeValue">
							<Code><![CDATA["IDLE_DEPOT"]]></Code>
						</InitialValue>
					</Properties>
				</Variable>
				<Variable Class="PlainVariable">
					<Id>1794500000412</Id>
					<Name><![CDATA[totalDistanceTraveled]]></Name>
					<X>50</X><Y>140</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<Properties SaveInSnapshot="true" Constant="false" AccessType="public" StaticVariable="false">
						<Type><![CDATA[double]]></Type>
						<InitialValue Class="CodeValue">
							<Code><![CDATA[0.0]]></Code>
						</InitialValue>
					</Properties>
				</Variable>
			</Variables>

			<StatechartElements>
				<StatechartElement Class="State" ParentState="ROOT_NODE">
					<Id>1794500000420</Id>
					<Name><![CDATA[IDLE_DEPOT]]></Name>
					<X>260</X><Y>80</Y>
					<Label><X>15</X><Y>15</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<Properties Width="150" Height="45">
						<EntryAction><![CDATA[currentStatus = "IDLE_DEPOT";]]></EntryAction>
						<FillColor>-6632142</FillColor>
					</Properties>
				</StatechartElement>
				<StatechartElement Class="State" ParentState="ROOT_NODE">
					<Id>1794500000421</Id>
					<Name><![CDATA[IN_TRANSIT]]></Name>
					<X>260</X><Y>180</Y>
					<Label><X>15</X><Y>15</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<Properties Width="150" Height="45">
						<EntryAction><![CDATA[currentStatus = "IN_TRANSIT";
batteryLevel = max(0.0, batteryLevel - 0.15);
totalDistanceTraveled += 12.0;]]></EntryAction>
						<FillColor>-14774017</FillColor>
					</Properties>
				</StatechartElement>
				<StatechartElement Class="State" ParentState="ROOT_NODE">
					<Id>1794500000422</Id>
					<Name><![CDATA[FAST_CHARGING]]></Name>
					<X>260</X><Y>280</Y>
					<Label><X>15</X><Y>15</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<Properties Width="150" Height="45">
						<EntryAction><![CDATA[currentStatus = "FAST_CHARGING";
batteryLevel = 1.0;]]></EntryAction>
						<FillColor>-10496</FillColor>
					</Properties>
				</StatechartElement>
				<StatechartElement Class="EntryPoint" ParentState="ROOT_NODE">
					<Id>1794500000423</Id>
					<Name><![CDATA[statechart]]></Name>
					<X>335</X><Y>40</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<Points>
						<Point><X>0</X><Y>0</Y></Point>
						<Point><X>0</X><Y>40</Y></Point>
					</Points>
					<Properties Target="1794500000420">
					</Properties>
				</StatechartElement>
				<StatechartElement Class="Transition" ParentState="ROOT_NODE">
					<Id>1794500000424</Id>
					<Name><![CDATA[tDispatch]]></Name>
					<X>335</X><Y>125</Y>
					<Label><X>10</X><Y>20</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<Points>
						<Point><X>0</X><Y>0</Y></Point>
						<Point><X>0</X><Y>55</Y></Point>
					</Points>
					<IconOffset>25.0</IconOffset>
					<Properties Source="1794500000420" Target="1794500000421" Trigger="timeout">
						<Timeout Class="CodeUnitValue">
							<Code><![CDATA[1.5]]></Code>
							<Unit Class="TimeUnits"><![CDATA[MINUTE]]></Unit>
						</Timeout>
						<Condition><![CDATA[true]]></Condition>
						<Rate Class="CodeUnitValue">
							<Code><![CDATA[1]]></Code>
							<Unit Class="RateUnits"><![CDATA[PER_MINUTE]]></Unit>
						</Rate>
						<MessageType><![CDATA[Object]]></MessageType>
						<DefaultTransition>true</DefaultTransition>
						<FilterType><![CDATA[unconditionally]]></FilterType>
						<EqualsExpression><![CDATA["text"]]></EqualsExpression>
						<SatisfiesExpression><![CDATA[true]]></SatisfiesExpression>
					</Properties>
				</StatechartElement>
				<StatechartElement Class="Transition" ParentState="ROOT_NODE">
					<Id>1794500000425</Id>
					<Name><![CDATA[tLowBattery]]></Name>
					<X>335</X><Y>225</Y>
					<Label><X>10</X><Y>20</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<Points>
						<Point><X>0</X><Y>0</Y></Point>
						<Point><X>0</X><Y>55</Y></Point>
					</Points>
					<IconOffset>25.0</IconOffset>
					<Properties Source="1794500000421" Target="1794500000422" Trigger="condition">
						<Timeout Class="CodeUnitValue">
							<Code><![CDATA[1]]></Code>
							<Unit Class="TimeUnits"><![CDATA[MINUTE]]></Unit>
						</Timeout>
						<Condition><![CDATA[batteryLevel <= 0.25]]></Condition>
						<Rate Class="CodeUnitValue">
							<Code><![CDATA[1]]></Code>
							<Unit Class="RateUnits"><![CDATA[PER_MINUTE]]></Unit>
						</Rate>
						<MessageType><![CDATA[Object]]></MessageType>
						<DefaultTransition>true</DefaultTransition>
						<FilterType><![CDATA[unconditionally]]></FilterType>
						<EqualsExpression><![CDATA["text"]]></EqualsExpression>
						<SatisfiesExpression><![CDATA[true]]></SatisfiesExpression>
					</Properties>
				</StatechartElement>
				<StatechartElement Class="Transition" ParentState="ROOT_NODE">
					<Id>1794500000426</Id>
					<Name><![CDATA[tReturnIdle]]></Name>
					<X>260</X><Y>202</Y>
					<Label><X>-85</X><Y>-45</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<Points>
						<Point><X>0</X><Y>0</Y></Point>
						<Point><X>-40</X><Y>0</Y></Point>
						<Point><X>-40</X><Y>-100</Y></Point>
						<Point><X>0</X><Y>-100</Y></Point>
					</Points>
					<IconOffset>60.0</IconOffset>
					<Properties Source="1794500000421" Target="1794500000420" Trigger="timeout">
						<Timeout Class="CodeUnitValue">
							<Code><![CDATA[2.5]]></Code>
							<Unit Class="TimeUnits"><![CDATA[MINUTE]]></Unit>
						</Timeout>
						<Condition><![CDATA[true]]></Condition>
						<Rate Class="CodeUnitValue">
							<Code><![CDATA[1]]></Code>
							<Unit Class="RateUnits"><![CDATA[PER_MINUTE]]></Unit>
						</Rate>
						<MessageType><![CDATA[Object]]></MessageType>
						<DefaultTransition>true</DefaultTransition>
						<FilterType><![CDATA[unconditionally]]></FilterType>
						<EqualsExpression><![CDATA["text"]]></EqualsExpression>
						<SatisfiesExpression><![CDATA[true]]></SatisfiesExpression>
					</Properties>
				</StatechartElement>
				<StatechartElement Class="Transition" ParentState="ROOT_NODE">
					<Id>1794500000427</Id>
					<Name><![CDATA[tChargeComplete]]></Name>
					<X>410</X><Y>302</Y>
					<Label><X>15</X><Y>-95</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<Points>
						<Point><X>0</X><Y>0</Y></Point>
						<Point><X>45</X><Y>0</Y></Point>
						<Point><X>45</X><Y>-200</Y></Point>
						<Point><X>0</X><Y>-200</Y></Point>
					</Points>
					<IconOffset>100.0</IconOffset>
					<Properties Source="1794500000422" Target="1794500000420" Trigger="timeout">
						<Timeout Class="CodeUnitValue">
							<Code><![CDATA[8.0]]></Code>
							<Unit Class="TimeUnits"><![CDATA[MINUTE]]></Unit>
						</Timeout>
						<Condition><![CDATA[true]]></Condition>
						<Rate Class="CodeUnitValue">
							<Code><![CDATA[1]]></Code>
							<Unit Class="RateUnits"><![CDATA[PER_MINUTE]]></Unit>
						</Rate>
						<MessageType><![CDATA[Object]]></MessageType>
						<DefaultTransition>true</DefaultTransition>
						<FilterType><![CDATA[unconditionally]]></FilterType>
						<EqualsExpression><![CDATA["text"]]></EqualsExpression>
						<SatisfiesExpression><![CDATA[true]]></SatisfiesExpression>
					</Properties>
				</StatechartElement>
			</StatechartElements>

			<Presentation>
				<Level>
					<Id>1794500000404</Id>
					<Name><![CDATA[level]]></Name>
					<X>0</X><Y>0</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>true</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>false</ShowLabel>
					<DrawMode>SHAPE_DRAW_2D3D</DrawMode>
					<Z>0</Z>
					<LevelVisibility>DIM_NON_CURRENT</LevelVisibility>
				</Level>
			</Presentation>
		</ActiveObjectClass>

		<!--   =========   Active Object Class: StudentOrder   ========  -->
		<ActiveObjectClass>
			<Id>1794500000500</Id>
			<Name><![CDATA[StudentOrder]]></Name>
			<Generic>false</Generic>
			<GenericParameter>
				<Id>1794500000501</Id>
				<Name><![CDATA[1794500000501]]></Name>
				<GenericParameterValue Class="CodeValue">
					<Code><![CDATA[T extends Agent]]></Code>
				</GenericParameterValue>
				<GenericParameterLabel><![CDATA[Generic parameter:]]></GenericParameterLabel>
			</GenericParameter>
			<FlowChartsUsage>ENTITY</FlowChartsUsage>
			<SamplesToKeep>100</SamplesToKeep>
			<LimitNumberOfArrayElements>false</LimitNumberOfArrayElements>
			<ElementsLimitValue>100</ElementsLimitValue>
			<MakeDefaultViewArea>true</MakeDefaultViewArea>
			<SceneGridColor/>
			<SceneBackgroundColor>-4144960</SceneBackgroundColor>
			<EnvironmentResourceRef></EnvironmentResourceRef>
			<EnvironmentType>NONE</EnvironmentType>
			<EnvironmentRotationX>0</EnvironmentRotationX>
			<EnvironmentRotationY>0</EnvironmentRotationY>
			<EnvironmentRotationZ>0</EnvironmentRotationZ>
			<EnvironmentIntensity>1</EnvironmentIntensity>
			<AgentProperties>
				<EnvironmentDefinesInitialLocation>true</EnvironmentDefinesInitialLocation>
				<RotateAnimationTowardsMovement>true</RotateAnimationTowardsMovement>
				<RotateAnimationVertically>false</RotateAnimationVertically>
				<VelocityCode Class="CodeUnitValue">
					<Code><![CDATA[1.0]]></Code>
					<Unit Class="SpeedUnits"><![CDATA[MPS]]></Unit>
				</VelocityCode>
				<MessageType><![CDATA[Object]]></MessageType>
				<PhysicalLength Class="CodeUnitValue">
					<Code><![CDATA[1]]></Code>
					<Unit Class="LengthUnits"><![CDATA[METER]]></Unit>
				</PhysicalLength>
				<PhysicalWidth Class="CodeUnitValue">
					<Code><![CDATA[1]]></Code>
					<Unit Class="LengthUnits"><![CDATA[METER]]></Unit>
				</PhysicalWidth>
				<PhysicalHeight Class="CodeUnitValue">
					<Code><![CDATA[1]]></Code>
					<Unit Class="LengthUnits"><![CDATA[METER]]></Unit>
				</PhysicalHeight>
			</AgentProperties>
			<EnvironmentProperties>
				<EnableSteps>false</EnableSteps>
				<StepDurationCode Class="CodeUnitValue">
					<Code><![CDATA[1.0]]></Code>
					<Unit Class="TimeUnits"><![CDATA[SECOND]]></Unit>
				</StepDurationCode>
				<SpaceType>CONTINUOUS</SpaceType>
				<WidthCode><![CDATA[500]]></WidthCode>
				<HeightCode><![CDATA[500]]></HeightCode>
				<ZHeightCode><![CDATA[0]]></ZHeightCode>
				<ColumnsCountCode><![CDATA[100]]></ColumnsCountCode>
				<RowsCountCode><![CDATA[100]]></RowsCountCode>
				<NeigborhoodType>MOORE</NeigborhoodType>
				<LayoutType>USER_DEF</LayoutType>
				<NetworkType>USER_DEF</NetworkType>
				<ConnectionsPerAgentCode><![CDATA[2]]></ConnectionsPerAgentCode>
				<ConnectionsRangeCode><![CDATA[50]]></ConnectionsRangeCode>
				<NeighborLinkFractionCode><![CDATA[0.95]]></NeighborLinkFractionCode>
				<MCode><![CDATA[10]]></MCode>
				<LineStyle>SOLID</LineStyle>
				<LineWidth>1</LineWidth>
				<LineColor>-16777216</LineColor>
				<LineZOrder>UNDER_AGENTS</LineZOrder>
				<LineArrow>NONE</LineArrow>
				<LineArrowPosition>END</LineArrowPosition>
			</EnvironmentProperties>
			<DatasetsCreationProperties>
				<AutoCreate>true</AutoCreate>
					<Id>1794500000502</Id>
					<OccurrenceAtTime>true</OccurrenceAtTime>
					<OccurrenceDate>1794500000000</OccurrenceDate>
					<OccurrenceTime Class="CodeUnitValue">
						<Code><![CDATA[0]]></Code>
						<Unit Class="TimeUnits"><![CDATA[MINUTE]]></Unit>
					</OccurrenceTime>
					<RecurrenceCode Class="CodeUnitValue">
						<Code><![CDATA[1]]></Code>
						<Unit Class="TimeUnits"><![CDATA[MINUTE]]></Unit>
					</RecurrenceCode>
			</DatasetsCreationProperties>
			<ScaleRuler>
				<Id>1794500000503</Id>
				<Name><![CDATA[scale]]></Name>
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
			<CurrentLevel>1794500000504</CurrentLevel>

			<Variables>
				<Variable Class="PlainVariable">
					<Id>1794500000510</Id>
					<Name><![CDATA[creationTime]]></Name>
					<X>50</X><Y>80</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<Properties SaveInSnapshot="true" Constant="false" AccessType="public" StaticVariable="false">
						<Type><![CDATA[double]]></Type>
						<InitialValue Class="CodeValue">
							<Code><![CDATA[0.0]]></Code>
						</InitialValue>
					</Properties>
				</Variable>
				<Variable Class="PlainVariable">
					<Id>1794500000511</Id>
					<Name><![CDATA[targetStation]]></Name>
					<X>50</X><Y>110</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<Properties SaveInSnapshot="true" Constant="false" AccessType="public" StaticVariable="false">
						<Type><![CDATA[String]]></Type>
						<InitialValue Class="CodeValue">
							<Code><![CDATA["Station B"]]></Code>
						</InitialValue>
					</Properties>
				</Variable>
				<Variable Class="PlainVariable">
					<Id>1794500000512</Id>
					<Name><![CDATA[priorityTier]]></Name>
					<X>50</X><Y>140</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>false</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>true</ShowLabel>
					<Properties SaveInSnapshot="true" Constant="false" AccessType="public" StaticVariable="false">
						<Type><![CDATA[int]]></Type>
						<InitialValue Class="CodeValue">
							<Code><![CDATA[1]]></Code>
						</InitialValue>
					</Properties>
				</Variable>
			</Variables>

			<Presentation>
				<Level>
					<Id>1794500000504</Id>
					<Name><![CDATA[level]]></Name>
					<X>0</X><Y>0</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>true</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>false</ShowLabel>
					<DrawMode>SHAPE_DRAW_2D3D</DrawMode>
					<Z>0</Z>
					<LevelVisibility>DIM_NON_CURRENT</LevelVisibility>
				</Level>
			</Presentation>
		</ActiveObjectClass>
	</ActiveObjectClasses>
	<DifferentialEquationsMethod>EULER</DifferentialEquationsMethod>
	<MixedEquationsMethod>RK45_NEWTON</MixedEquationsMethod>
	<AlgebraicEquationsMethod>MODIFIED_NEWTON</AlgebraicEquationsMethod>
	<AbsoluteAccuracy>1.0E-5</AbsoluteAccuracy>
	<FixedTimeStep>0.001</FixedTimeStep>
	<RelativeAccuracy>1.0E-5</RelativeAccuracy>
	<TimeAccuracy>1.0E-5</TimeAccuracy>
	<Frame>
		<Id>1794500000002</Id>
		<Width>1000</Width>
		<Height>650</Height>
	</Frame>
	<Database>
		<Id>1794500000003</Id>
		<Logging>false</Logging>
		<AutoExport>false</AutoExport>
		<ShutdownCompact>false</ShutdownCompact>
		<ImportSettings>
		</ImportSettings>
		<ExportSettings>
		</ExportSettings>
	</Database>

	<!-- ========================================================================= -->
	<!--                           RUN CONFIGURATION                               -->
	<!-- ========================================================================= -->
	<RunConfiguration ActiveObjectClassId="1794500000010">
		<Id>1794500000600</Id>
		<Name><![CDATA[RunConfiguration]]></Name>
		<MaximumMemory>1024</MaximumMemory>
		<ModelTimeProperties>
			<StopOption><![CDATA[Stop at specified time]]></StopOption>
			<InitialDate><![CDATA[1794500000000]]></InitialDate>
			<InitialTime><![CDATA[0.0]]></InitialTime>
			<FinalDate><![CDATA[1794528800000]]></FinalDate>
			<FinalTime><![CDATA[480.0]]></FinalTime>
		</ModelTimeProperties>
		<AnimationProperties>
			<StopNever>false</StopNever>
			<ExecutionMode>realTimeScaled</ExecutionMode>
			<RealTimeScale>2.0</RealTimeScale>
			<EnableZoomAndPanning>true</EnableZoomAndPanning>
			<EnableDeveloperPanel>true</EnableDeveloperPanel>
			<ShowDeveloperPanelOnStart>false</ShowDeveloperPanelOnStart>
		</AnimationProperties>
		<Inputs>
		</Inputs>
		<Outputs>
		</Outputs>
	</RunConfiguration>

	<!-- ========================================================================= -->
	<!--                      THE 5 REQUIRED EXPERIMENTS                           -->
	<!-- ========================================================================= -->
	<Experiments>
		<!-- 1. SIMULATION EXPERIMENT: Interactive Baseline FIFO Run -->
		<SimulationExperiment ActiveObjectClassId="1794500000010">
			<Id>1794500000701</Id>
			<Name><![CDATA[Simulation]]></Name>
			<CommandLineArguments><![CDATA[]]></CommandLineArguments>
			<MaximumMemory>1024</MaximumMemory>
			<RandomNumberGenerationType>fixedSeed</RandomNumberGenerationType>
			<CustomGeneratorCode>new Random()</CustomGeneratorCode>
			<SeedValue>42</SeedValue>
			<SelectionModeForSimultaneousEvents>LIFO</SelectionModeForSimultaneousEvents>
			<VmArgs><![CDATA[]]></VmArgs>
			<LoadRootFromSnapshot>false</LoadRootFromSnapshot>
			<Presentation>
				<Text>
					<Id>1794500000711</Id>
					<Name><![CDATA[textSim]]></Name>
					<X>50</X><Y>30</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>true</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>false</ShowLabel>
					<DrawMode>SHAPE_DRAW_2D3D</DrawMode>
					<EmbeddedIcon>false</EmbeddedIcon>
					<Z>0</Z>
					<Rotation>0.0</Rotation>
					<Color>-12490271</Color>
					<Text><![CDATA[MDC Robotics Lab : Baseline Interactive Run (FIFO)]]></Text>
					<Font>
						<Name>SansSerif</Name>
						<Size>22</Size>
						<Style>0</Style>
					</Font>
					<Alignment>LEFT</Alignment>
				</Text>
			</Presentation>
			<Parameters>
				<Parameter>
					<ParameterName><![CDATA[numberOfAMRs]]></ParameterName>
					<ParameterValue Class="CodeValue">
						<Code><![CDATA[3]]></Code>
					</ParameterValue>
				</Parameter>
				<Parameter>
					<ParameterName><![CDATA[numberOfDocks]]></ParameterName>
				</Parameter>
				<Parameter>
					<ParameterName><![CDATA[studentArrivalRate]]></ParameterName>
					<ParameterValue Class="CodeValue">
						<Code><![CDATA[18.0]]></Code>
					</ParameterValue>
				</Parameter>
				<Parameter>
					<ParameterName><![CDATA[dispatchPolicy]]></ParameterName>
					<ParameterValue Class="CodeValue">
						<Code><![CDATA[0]]></Code>
					</ParameterValue>
				</Parameter>
				<Parameter>
					<ParameterName><![CDATA[chargingThreshold]]></ParameterName>
				</Parameter>
				<Parameter>
					<ParameterName><![CDATA[batteryDischargeRate]]></ParameterName>
				</Parameter>
			</Parameters>
			<PresentationProperties>
				<EnableZoomAndPanning>true</EnableZoomAndPanning>
				<ExecutionMode><![CDATA[realTimeScaled]]></ExecutionMode>
				<Title><![CDATA[MDC Robotics Lab : Baseline Interactive Run]]></Title>
				<EnableDeveloperPanel>true</EnableDeveloperPanel>
				<ShowDeveloperPanelOnStart>false</ShowDeveloperPanelOnStart>
				<RealTimeScale>2.0</RealTimeScale>
			</PresentationProperties>
			<ModelTimeProperties>
				<StopOption><![CDATA[Stop at specified time]]></StopOption>
				<InitialDate><![CDATA[1794500000000]]></InitialDate>
				<InitialTime><![CDATA[0.0]]></InitialTime>
				<FinalDate><![CDATA[1794528800000]]></FinalDate>
				<FinalTime><![CDATA[480.0]]></FinalTime>
			</ModelTimeProperties>
			<BypassInitialScreen>true</BypassInitialScreen>
		</SimulationExperiment>

		<!-- 2. OPTIMIZATION EXPERIMENT: Fleet Sizing Evaluation (4 AMRs, 2 Docks) -->
		<SimulationExperiment ActiveObjectClassId="1794500000010">
			<Id>1794500000702</Id>
			<Name><![CDATA[Optimization_FleetSizing]]></Name>
			<CommandLineArguments><![CDATA[]]></CommandLineArguments>
			<MaximumMemory>1024</MaximumMemory>
			<RandomNumberGenerationType>fixedSeed</RandomNumberGenerationType>
			<CustomGeneratorCode>new Random()</CustomGeneratorCode>
			<SeedValue>101</SeedValue>
			<SelectionModeForSimultaneousEvents>LIFO</SelectionModeForSimultaneousEvents>
			<VmArgs><![CDATA[]]></VmArgs>
			<LoadRootFromSnapshot>false</LoadRootFromSnapshot>
			<Presentation>
				<Text>
					<Id>1794500000712</Id>
					<Name><![CDATA[textOpt]]></Name>
					<X>50</X><Y>30</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>true</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>false</ShowLabel>
					<DrawMode>SHAPE_DRAW_2D3D</DrawMode>
					<EmbeddedIcon>false</EmbeddedIcon>
					<Z>0</Z>
					<Rotation>0.0</Rotation>
					<Color>-12490271</Color>
					<Text><![CDATA[MDC Robotics Lab : Fleet Sizing Evaluation (4 AMRs / 2 Docks)]]></Text>
					<Font>
						<Name>SansSerif</Name>
						<Size>22</Size>
						<Style>0</Style>
					</Font>
					<Alignment>LEFT</Alignment>
				</Text>
			</Presentation>
			<Parameters>
				<Parameter>
					<ParameterName><![CDATA[numberOfAMRs]]></ParameterName>
					<ParameterValue Class="CodeValue">
						<Code><![CDATA[4]]></Code>
					</ParameterValue>
				</Parameter>
				<Parameter>
					<ParameterName><![CDATA[numberOfDocks]]></ParameterName>
				</Parameter>
				<Parameter>
					<ParameterName><![CDATA[studentArrivalRate]]></ParameterName>
					<ParameterValue Class="CodeValue">
						<Code><![CDATA[18.0]]></Code>
					</ParameterValue>
				</Parameter>
				<Parameter>
					<ParameterName><![CDATA[dispatchPolicy]]></ParameterName>
					<ParameterValue Class="CodeValue">
						<Code><![CDATA[0]]></Code>
					</ParameterValue>
				</Parameter>
				<Parameter>
					<ParameterName><![CDATA[chargingThreshold]]></ParameterName>
				</Parameter>
				<Parameter>
					<ParameterName><![CDATA[batteryDischargeRate]]></ParameterName>
				</Parameter>
			</Parameters>
			<PresentationProperties>
				<EnableZoomAndPanning>true</EnableZoomAndPanning>
				<ExecutionMode><![CDATA[realTimeScaled]]></ExecutionMode>
				<Title><![CDATA[MDC Robotics Lab : Optimized Fleet Sizing (4 AMRs / 2 Docks)]]></Title>
				<EnableDeveloperPanel>true</EnableDeveloperPanel>
				<ShowDeveloperPanelOnStart>false</ShowDeveloperPanelOnStart>
				<RealTimeScale>2.0</RealTimeScale>
			</PresentationProperties>
			<ModelTimeProperties>
				<StopOption><![CDATA[Stop at specified time]]></StopOption>
				<InitialDate><![CDATA[1794500000000]]></InitialDate>
				<InitialTime><![CDATA[0.0]]></InitialTime>
				<FinalDate><![CDATA[1794528800000]]></FinalDate>
				<FinalTime><![CDATA[480.0]]></FinalTime>
			</ModelTimeProperties>
			<BypassInitialScreen>true</BypassInitialScreen>
		</SimulationExperiment>

		<!-- 3. COMPARE DISPATCH POLICIES: PPO Supervisory Control -->
		<SimulationExperiment ActiveObjectClassId="1794500000010">
			<Id>1794500000703</Id>
			<Name><![CDATA[Compare_Dispatch_Policies]]></Name>
			<CommandLineArguments><![CDATA[]]></CommandLineArguments>
			<MaximumMemory>1024</MaximumMemory>
			<RandomNumberGenerationType>fixedSeed</RandomNumberGenerationType>
			<CustomGeneratorCode>new Random()</CustomGeneratorCode>
			<SeedValue>202</SeedValue>
			<SelectionModeForSimultaneousEvents>LIFO</SelectionModeForSimultaneousEvents>
			<VmArgs><![CDATA[]]></VmArgs>
			<LoadRootFromSnapshot>false</LoadRootFromSnapshot>
			<Presentation>
				<Text>
					<Id>1794500000713</Id>
					<Name><![CDATA[textCompare]]></Name>
					<X>50</X><Y>30</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>true</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>false</ShowLabel>
					<DrawMode>SHAPE_DRAW_2D3D</DrawMode>
					<EmbeddedIcon>false</EmbeddedIcon>
					<Z>0</Z>
					<Rotation>0.0</Rotation>
					<Color>-12490271</Color>
					<Text><![CDATA[MDC Robotics Lab : Policy Comparison (PPO Dispatch)]]></Text>
					<Font>
						<Name>SansSerif</Name>
						<Size>22</Size>
						<Style>0</Style>
					</Font>
					<Alignment>LEFT</Alignment>
				</Text>
			</Presentation>
			<Parameters>
				<Parameter>
					<ParameterName><![CDATA[numberOfAMRs]]></ParameterName>
					<ParameterValue Class="CodeValue">
						<Code><![CDATA[3]]></Code>
					</ParameterValue>
				</Parameter>
				<Parameter>
					<ParameterName><![CDATA[numberOfDocks]]></ParameterName>
				</Parameter>
				<Parameter>
					<ParameterName><![CDATA[studentArrivalRate]]></ParameterName>
					<ParameterValue Class="CodeValue">
						<Code><![CDATA[18.0]]></Code>
					</ParameterValue>
				</Parameter>
				<Parameter>
					<ParameterName><![CDATA[dispatchPolicy]]></ParameterName>
					<ParameterValue Class="CodeValue">
						<Code><![CDATA[2]]></Code>
					</ParameterValue>
				</Parameter>
				<Parameter>
					<ParameterName><![CDATA[chargingThreshold]]></ParameterName>
				</Parameter>
				<Parameter>
					<ParameterName><![CDATA[batteryDischargeRate]]></ParameterName>
				</Parameter>
			</Parameters>
			<PresentationProperties>
				<EnableZoomAndPanning>true</EnableZoomAndPanning>
				<ExecutionMode><![CDATA[realTimeScaled]]></ExecutionMode>
				<Title><![CDATA[MDC Robotics Lab : Policy Comparison (PPO Dispatch)]]></Title>
				<EnableDeveloperPanel>true</EnableDeveloperPanel>
				<ShowDeveloperPanelOnStart>false</ShowDeveloperPanelOnStart>
				<RealTimeScale>2.0</RealTimeScale>
			</PresentationProperties>
			<ModelTimeProperties>
				<StopOption><![CDATA[Stop at specified time]]></StopOption>
				<InitialDate><![CDATA[1794500000000]]></InitialDate>
				<InitialTime><![CDATA[0.0]]></InitialTime>
				<FinalDate><![CDATA[1794528800000]]></FinalDate>
				<FinalTime><![CDATA[480.0]]></FinalTime>
			</ModelTimeProperties>
			<BypassInitialScreen>true</BypassInitialScreen>
		</SimulationExperiment>

		<!-- 4. MONTE CARLO EXPERIMENT: Stochastic Replications for Student Wait Times -->
		<SimulationExperiment ActiveObjectClassId="1794500000010">
			<Id>1794500000704</Id>
			<Name><![CDATA[MonteCarlo_WaitTimes]]></Name>
			<CommandLineArguments><![CDATA[]]></CommandLineArguments>
			<MaximumMemory>1024</MaximumMemory>
			<RandomNumberGenerationType>randomSeed</RandomNumberGenerationType>
			<CustomGeneratorCode>new Random()</CustomGeneratorCode>
			<SelectionModeForSimultaneousEvents>LIFO</SelectionModeForSimultaneousEvents>
			<VmArgs><![CDATA[]]></VmArgs>
			<LoadRootFromSnapshot>false</LoadRootFromSnapshot>
			<Presentation>
				<Text>
					<Id>1794500000714</Id>
					<Name><![CDATA[textMC]]></Name>
					<X>50</X><Y>30</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>true</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>false</ShowLabel>
					<DrawMode>SHAPE_DRAW_2D3D</DrawMode>
					<EmbeddedIcon>false</EmbeddedIcon>
					<Z>0</Z>
					<Rotation>0.0</Rotation>
					<Color>-12490271</Color>
					<Text><![CDATA[MDC Robotics Lab : Monte Carlo Stochastic Run]]></Text>
					<Font>
						<Name>SansSerif</Name>
						<Size>22</Size>
						<Style>0</Style>
					</Font>
					<Alignment>LEFT</Alignment>
				</Text>
			</Presentation>
			<Parameters>
				<Parameter>
					<ParameterName><![CDATA[numberOfAMRs]]></ParameterName>
					<ParameterValue Class="CodeValue">
						<Code><![CDATA[3]]></Code>
					</ParameterValue>
				</Parameter>
				<Parameter>
					<ParameterName><![CDATA[numberOfDocks]]></ParameterName>
				</Parameter>
				<Parameter>
					<ParameterName><![CDATA[studentArrivalRate]]></ParameterName>
				</Parameter>
				<Parameter>
					<ParameterName><![CDATA[dispatchPolicy]]></ParameterName>
					<ParameterValue Class="CodeValue">
						<Code><![CDATA[2]]></Code>
					</ParameterValue>
				</Parameter>
				<Parameter>
					<ParameterName><![CDATA[chargingThreshold]]></ParameterName>
				</Parameter>
				<Parameter>
					<ParameterName><![CDATA[batteryDischargeRate]]></ParameterName>
				</Parameter>
			</Parameters>
			<PresentationProperties>
				<EnableZoomAndPanning>true</EnableZoomAndPanning>
				<ExecutionMode><![CDATA[realTimeScaled]]></ExecutionMode>
				<Title><![CDATA[MDC Robotics Lab : Monte Carlo Stochastic Run]]></Title>
				<EnableDeveloperPanel>true</EnableDeveloperPanel>
				<ShowDeveloperPanelOnStart>false</ShowDeveloperPanelOnStart>
				<RealTimeScale>5.0</RealTimeScale>
			</PresentationProperties>
			<ModelTimeProperties>
				<StopOption><![CDATA[Stop at specified time]]></StopOption>
				<InitialDate><![CDATA[1794500000000]]></InitialDate>
				<InitialTime><![CDATA[0.0]]></InitialTime>
				<FinalDate><![CDATA[1794528800000]]></FinalDate>
				<FinalTime><![CDATA[480.0]]></FinalTime>
			</ModelTimeProperties>
			<BypassInitialScreen>true</BypassInitialScreen>
		</SimulationExperiment>

		<!-- 5. SENSITIVITY ANALYSIS EXPERIMENT: Battery Degradation & Demand Surge -->
		<SimulationExperiment ActiveObjectClassId="1794500000010">
			<Id>1794500000705</Id>
			<Name><![CDATA[Sensitivity_BatteryAndDemand]]></Name>
			<CommandLineArguments><![CDATA[]]></CommandLineArguments>
			<MaximumMemory>1024</MaximumMemory>
			<RandomNumberGenerationType>fixedSeed</RandomNumberGenerationType>
			<CustomGeneratorCode>new Random()</CustomGeneratorCode>
			<SeedValue>303</SeedValue>
			<SelectionModeForSimultaneousEvents>LIFO</SelectionModeForSimultaneousEvents>
			<VmArgs><![CDATA[]]></VmArgs>
			<LoadRootFromSnapshot>false</LoadRootFromSnapshot>
			<Presentation>
				<Text>
					<Id>1794500000715</Id>
					<Name><![CDATA[textSens]]></Name>
					<X>50</X><Y>30</Y>
					<Label><X>10</X><Y>0</Y></Label>
					<PublicFlag>true</PublicFlag>
					<PresentationFlag>true</PresentationFlag>
					<ShowLabel>false</ShowLabel>
					<DrawMode>SHAPE_DRAW_2D3D</DrawMode>
					<EmbeddedIcon>false</EmbeddedIcon>
					<Z>0</Z>
					<Rotation>0.0</Rotation>
					<Color>-12490271</Color>
					<Text><![CDATA[MDC Robotics Lab : Sensitivity & Surge Demand Stress Run]]></Text>
					<Font>
						<Name>SansSerif</Name>
						<Size>22</Size>
						<Style>0</Style>
					</Font>
					<Alignment>LEFT</Alignment>
				</Text>
			</Presentation>
			<Parameters>
				<Parameter>
					<ParameterName><![CDATA[numberOfAMRs]]></ParameterName>
					<ParameterValue Class="CodeValue">
						<Code><![CDATA[3]]></Code>
					</ParameterValue>
				</Parameter>
				<Parameter>
					<ParameterName><![CDATA[numberOfDocks]]></ParameterName>
				</Parameter>
				<Parameter>
					<ParameterName><![CDATA[studentArrivalRate]]></ParameterName>
					<ParameterValue Class="CodeValue">
						<Code><![CDATA[28.0]]></Code>
					</ParameterValue>
				</Parameter>
				<Parameter>
					<ParameterName><![CDATA[dispatchPolicy]]></ParameterName>
				</Parameter>
				<Parameter>
					<ParameterName><![CDATA[chargingThreshold]]></ParameterName>
				</Parameter>
				<Parameter>
					<ParameterName><![CDATA[batteryDischargeRate]]></ParameterName>
					<ParameterValue Class="CodeValue">
						<Code><![CDATA[0.03]]></Code>
					</ParameterValue>
				</Parameter>
			</Parameters>
			<PresentationProperties>
				<EnableZoomAndPanning>true</EnableZoomAndPanning>
				<ExecutionMode><![CDATA[realTimeScaled]]></ExecutionMode>
				<Title><![CDATA[MDC Robotics Lab : Sensitivity & Surge Demand Stress Run]]></Title>
				<EnableDeveloperPanel>true</EnableDeveloperPanel>
				<ShowDeveloperPanelOnStart>false</ShowDeveloperPanelOnStart>
				<RealTimeScale>2.0</RealTimeScale>
			</PresentationProperties>
			<ModelTimeProperties>
				<StopOption><![CDATA[Stop at specified time]]></StopOption>
				<InitialDate><![CDATA[1794500000000]]></InitialDate>
				<InitialTime><![CDATA[0.0]]></InitialTime>
				<FinalDate><![CDATA[1794528800000]]></FinalDate>
				<FinalTime><![CDATA[480.0]]></FinalTime>
			</ModelTimeProperties>
			<BypassInitialScreen>true</BypassInitialScreen>
		</SimulationExperiment>
	</Experiments>

	<ModelResources>
		<Resource>
			<Id>1794500000801</Id>
			<Path><![CDATA[assets/robotics_lab_floorplan.png]]></Path>
			<ReferencedFromUserCode>false</ReferencedFromUserCode>
			<Location>FILE_SYSTEM</Location>
		</Resource>
	</ModelResources>

	<RequiredLibraryReference>
		<LibraryName><![CDATA[com.anylogic.libraries.modules.markup_descriptors]]></LibraryName>
		<VersionMajor>1</VersionMajor>
		<VersionMinor>0</VersionMinor>
		<VersionBuild>0</VersionBuild>
	</RequiredLibraryReference>
	<RequiredLibraryReference>
		<LibraryName><![CDATA[com.anylogic.libraries.processmodeling]]></LibraryName>
		<VersionMajor>8</VersionMajor>
		<VersionMinor>0</VersionMinor>
		<VersionBuild>5</VersionBuild>
	</RequiredLibraryReference>
</Model>
<ConvertersApplied>
	<Uuid>9f7858c9-b2c8-4ead-9244-fd08833f642b</Uuid>
	<Uuid>404652e6-561a-404c-aab2-ab7415f40ef5</Uuid>
	<Uuid>6fd6cd57-6dfe-4fc6-be0b-c74065351957</Uuid>
	<Uuid>3325dc48-3ad4-41e3-836f-dfd0e98fe1ed</Uuid>
	<Uuid>bb27038a-0f3a-48bb-b235-4a44066a14aa</Uuid>
	<Uuid>3f69ef3d-706e-41a6-8af0-11658c5eef68</Uuid>
	<Uuid>3f6fe405-e047-4304-91d6-6eee206d1106</Uuid>
	<Uuid>820d2b51-5b4a-48e7-b0b6-e46418e3c0f2</Uuid>
	<Uuid>630818fa-8975-4b70-976f-03180dce01db</Uuid>
	<Uuid>7c7e471c-004e-495e-a4ad-d840620ab38e</Uuid>
	<Uuid>3e38ff63-1f70-4ec0-b42c-e879b146785d</Uuid>
	<Uuid>b1eb86e4-14b3-405c-8257-56b80f1b485d</Uuid>
	<Uuid>d55f9fb6-86bb-45ea-9db1-79cecfa0ce91</Uuid>
	<Uuid>ab77aafd-8f02-4354-b789-928d45b1f73c</Uuid>
	<Uuid>e4f14fd7-1c4a-42e9-b91d-db2415f475db</Uuid>
	<Uuid>6d208120-6c7a-45a6-b411-402f18890d9b</Uuid>
	<Uuid>1816cdd0-177c-4973-9e88-dd8b95318556</Uuid>
	<Uuid>5c23f62f-06dc-46ad-8ead-688ec434e3e5</Uuid>
	<Uuid>5c7d7990-3f35-41eb-ae16-d0c16098acc6</Uuid>
	<Uuid>02a16c52-a834-4f30-b6af-a6aee51a294e</Uuid>
	<Uuid>f0988929-2718-4984-a1b6-c1f2ce152f1f</Uuid>
	<Uuid>1c9d9cfe-ea2b-43f9-8f62-dc31d8ed3ae1</Uuid>
	<Uuid>34cb742a-8ba4-47a7-87e6-f2685fe69e97</Uuid>
	<Uuid>4fe10751-c399-4752-94b7-30113ad45070</Uuid>
	<Uuid>c13fe5ac-6466-446e-886a-12df1431b1eb</Uuid>
	<Uuid>714f9ca2-426e-4bff-8569-2d18f58fdcf8</Uuid>
	<Uuid>045aeb5f-1087-4ac7-9702-a49404e7f7e8</Uuid>
	<Uuid>840e9a0a-de98-4b7d-a172-f9bbda2d6b98</Uuid>
	<Uuid>e342358b-75ed-4812-9376-6043fb6cb473</Uuid>
	<Uuid>f3d5ccdc-1bb3-466f-871d-f6b92a26cbb4</Uuid>
	<Uuid>59acb6fb-561c-4038-b722-a596a748b3c7</Uuid>
	<Uuid>be7e6726-05c0-4228-821d-a8df91aeb5bc</Uuid>
	<Uuid>df4a6a60-9ce8-4c6c-91c0-ad5a5d732259</Uuid>
	<Uuid>47491eb9-4606-42bd-8399-125a2b95fded</Uuid>
	<Uuid>9b2d1306-5d19-439a-8f2c-b144dd7e22fa</Uuid>
	<Uuid>ef421152-8732-4f97-9acb-c8e9a6890d5e</Uuid>
	<Uuid>d48f8080-25b1-44f5-8322-7bf2712ff974</Uuid>
	<Uuid>6c4de826-daad-4cd4-b703-51dfe803e822</Uuid>
	<Uuid>01af22d6-6889-4e98-a3df-e6eddc40fc92</Uuid>
	<Uuid>ea3b3dbe-cca2-4bde-957b-feaef7e18789</Uuid>
	<Uuid>e737c8c6-b526-4f88-b89e-554e205b0614</Uuid>
	<Uuid>efd24e87-d7f7-425f-9cb0-3ee17c7b2116</Uuid>
	<Uuid>a62607e6-047e-4910-a1ec-5426bf9283b5</Uuid>
	<Uuid>64dceb5b-de05-47c7-8e40-e9b293e80d75</Uuid>
	<Uuid>8d51c652-6aee-4de8-ba03-47b289a13ec5</Uuid>
	<Uuid>51d7b5ce-5664-4750-b1a0-fabcdc31e49a</Uuid>
	<Uuid>6522e3af-aa9e-421c-b667-e11db73cd8ca</Uuid>
	<Uuid>9ac073a0-7abf-4dff-826f-9c44d4780590</Uuid>
	<Uuid>2da9c21c-adc7-405a-a36e-46fbd9dfcd42</Uuid>
	<Uuid>fe4d1053-9c84-4221-bac7-cb489a7064ff</Uuid>
	<Uuid>1f005f88-e6d7-4bdc-81fa-3acf4c89cf64</Uuid>
	<Uuid>42dc5a7c-d7b1-4653-92b9-9359b46cc2d4</Uuid>
	<Uuid>e25721a9-34f9-479c-a4c3-31f5ec9e117d</Uuid>
	<Uuid>506d1de3-06df-4131-9e88-e43f1768e3d8</Uuid>
	<Uuid>e6625695-25a2-43d0-9056-1e9a1a594b1e</Uuid>
	<Uuid>91990287-4edf-4e38-aa6c-66d0e906807b</Uuid>
	<Uuid>2216cdd0-177c-5678-9e88-dd8b95312234</Uuid>
	<Uuid>1737c8c6-b526-4dd8-589e-ee4e205b06f4</Uuid>
	<Uuid>6a43bef6-8b70-4253-a828-82c3ab399655</Uuid>
	<Uuid>0a27038a-0f3a-48bb-b235-4a44066a1402</Uuid>
	<Uuid>0a9ec2c3-5e18-4c0a-a183-fd86d9d9a08b</Uuid>
	<Uuid>2216cdd0-177c-5678-9e88-dd8b95313334</Uuid>
	<Uuid>92afa9c7-cb47-45df-8559-1b947cbeacee</Uuid>
	<Uuid>896f4ff2-c039-43e1-8c65-183592ba63e2</Uuid>
	<Uuid>eada5e9c-56b7-4492-b3b1-03f1eb36a209</Uuid>
	<Uuid>2216cdd0-177c-5678-9e88-dd8b95313335</Uuid>
	<Uuid>5b8ebeed-6b58-4c3a-8d5f-0958b1a90ce6</Uuid>
	<Uuid>c39ae7a6-edcf-4673-923a-96829a5df80c</Uuid>
	<Uuid>af233c46-2e37-4dd0-a79f-cc6184140b1c</Uuid>
	<Uuid>53a0a65d-9a11-4cd9-8e3a-c6852af4d6e3</Uuid>
	<Uuid>01593659-ae66-4c89-b2b6-9a95d1c1f509</Uuid>
</ConvertersApplied>
</AnyLogicWorkspace>
"""


def main():
    parser = argparse.ArgumentParser(
        description="Bootstrap baseline MDC_Robotics_Lab_Simulation.alp"
    )
    parser.add_argument(
        "--force-overwrite",
        action="store_true",
        help="Required to overwrite an existing MDC_Robotics_Lab_Simulation.alp",
    )
    args = parser.parse_args()

    dest_dir = Path(__file__).resolve().parent
    dest_dir.mkdir(parents=True, exist_ok=True)
    alp_path = dest_dir / "MDC_Robotics_Lab_Simulation.alp"

    if alp_path.exists() and not args.force_overwrite:
        print(
            "WARNING: MDC_Robotics_Lab_Simulation.alp already exists and is actively "
            "maintained directly in AnyLogic 8 IDE / anylogic-cli (Issue #1).\n"
            "Re-generating would overwrite the team's simulation model changes.\n"
            "Refusing to overwrite. Pass --force-overwrite ONLY if you intentionally "
            "want to reset the file to the baseline scaffold.",
            file=sys.stderr,
        )
        sys.exit(1)

    print(f"Generating AnyLogic Project File at: {alp_path}")
    with open(alp_path, "w", encoding="utf-8") as f:
        f.write(ALP_TEMPLATE.strip())

    print(f"Successfully generated {alp_path.name} ({alp_path.stat().st_size:,} bytes)!")


if __name__ == "__main__":
    main()
