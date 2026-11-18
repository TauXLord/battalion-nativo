package com.gamedozer.battalion.ui
{
   import com.gamedozer.battalion.*;
   import com.gamedozer.battalion.assets.*;
   import com.gamedozer.battalion.audio.*;
   import com.gamedozer.battalion.data.*;
   import com.gamedozer.battalion.display.*;
   import com.gamedozer.battalion.game.Controller;
   import com.gamedozer.battalion.utils.*;
   import com.gamedozer.ui.modes.*;
   import com.gamedozer.utils.IStorage;
   import flash.display.*;
   import flash.events.*;
   import flash.filters.*;
   import flash.net.URLRequest;
   import flash.net.navigateToURL;
   import flash.text.*;
   import flash.utils.getDefinitionByName;
   
   public class CampaignMenu extends Sprite implements ModeInterface
   {
      
      protected var nextButton:TileSheetButton;
      
      protected var mainMenuButton:VistaButton;
      
      protected var header:Bitmap;
      
      protected const MINIMAP_HEIGHT:int = 184;
      
      protected var minimap:BitmapData;
      
      protected var xmlLoader:XMLLoader;
      
      protected var startButton:VistaButton;
      
      protected var m_difficultyPanel:DifficultyPanel;
      
      protected var bootCampButton:VistaButton;
      
      protected var minimapBitmap:Bitmap;
      
      protected var prevButton:TileSheetButton;
      
      protected var leftEpisodeButton:VistaButton;
      
      protected var chapter:HeadingTextField;
      
      protected var difficulty:int = 1;
      
      protected var campaignMenuData:CampaignMenuData;
      
      protected var medals:Array;
      
      protected var missionText:CustomTextField;
      
      protected var campaignButton:VistaButton;
      
      protected var rightEpisodeButton:VistaButton;
      
      protected const INFO_VERTICAL_OFFSET:int = 100;
      
      protected const MINIMAP_WIDTH:int = 140;
      
      public function CampaignMenu()
      {
         var ep2Class:Class;
         var mission:BattalionPanel;
         var ep1Class:Class;
         var headerHeight:int;
         var top:BattalionPanel;
         var offsetX:int;
         var missionPanelHeight:Number;
         var bg:Sprite = null;
         var leftEpisodeButtonLinkage:String = null;
         var rightEpisodeButtonLinkage:String = null;
         super();
         xmlLoader = BattalionMain.getXMLLoader();
         header = new Bitmap();
         addChild(header);
         headerHeight = 175;
         bg = new Sprite();
         bg.addChild(new Bitmap(BitmapLibrary.loadBitmap("bg_bootcamp")));
         bg.y = headerHeight;
         addChild(bg);
         offsetX = 30;
         missionPanelHeight = 200;
         mission = new BattalionPanel(330,missionPanelHeight,BattalionPanel.SPOTTED,BattalionPanel.FRAME2,"Mission Brief");
         mission.x = 188;
         mission.y = bg.y + 22 + INFO_VERTICAL_OFFSET;
         addChild(mission);
         missionText = new CustomTextField("",0,12);
         missionText.wordWrap = true;
         missionText.width = mission.rWidth - 10;
         missionText.height = missionPanelHeight - 10;
         missionText.x = mission.x + 5;
         missionText.y = mission.y + 24;
         addChild(missionText);
         m_difficultyPanel = new DifficultyPanel(difficultyChangedCallback);
         addChild(m_difficultyPanel);
         m_difficultyPanel.x = 580;
         m_difficultyPanel.y = 240 + INFO_VERTICAL_OFFSET;
         mainMenuButton = new VistaButton("Main Menu",BattalionAssets.s_ui_left_arrow);
         mainMenuButton.width = 200;
         mainMenuButton.height = 60;
         mainMenuButton.x = 8;
         mainMenuButton.y = BattalionMain.HEIGHT - mainMenuButton.height - 8;
         addChild(mainMenuButton);
         startButton = new VistaButton("Start Game",BattalionAssets.s_ui_confirm);
         startButton.width = mainMenuButton.width;
         startButton.height = mainMenuButton.height;
         startButton.x = BattalionMain.WIDTH - startButton.width - 8;
         startButton.y = mainMenuButton.y;
         addChild(startButton);
         bootCampButton = new VistaButton("Go to Bootcamp",BattalionAssets.s_ico_bootcamp);
         bootCampButton.width = mainMenuButton.width;
         bootCampButton.height = mainMenuButton.height;
         bootCampButton.x = (BattalionMain.WIDTH - bootCampButton.width) / 2;
         bootCampButton.y = mainMenuButton.y;
         addChild(bootCampButton);
         bootCampButton.addEventListener(MouseEvent.CLICK,clickBootCamp);
         campaignButton = new VistaButton("Go to Campaign",BattalionAssets.s_ico_campaign);
         campaignButton.width = mainMenuButton.width;
         campaignButton.height = mainMenuButton.height;
         campaignButton.x = bootCampButton.x;
         campaignButton.y = bootCampButton.y;
         addChild(campaignButton);
         campaignButton.addEventListener(MouseEvent.CLICK,clickCampaign);
         createMinimap(bg.y);
         top = new BattalionPanel(350,70,BattalionPanel.SPOTTED,BattalionPanel.FRAME1);
         top.x = BattalionMain.WIDTH / 2 - top.rWidth / 2;
         top.y = INFO_VERTICAL_OFFSET + 100;
         addChild(top);
         chapter = new HeadingTextField("",0,22);
         chapter.filters = [new DropShadowFilter(4,45,0,0.2)];
         chapter.x = (BattalionMain.WIDTH - chapter.width) / 2;
         chapter.y = top.y + (top.rHeight - chapter.height) / 2 - 10;
         addChild(chapter);
         if(BattalionMain.EPISODE == BattalionContext.EPISODE_EPISODE1)
         {
            leftEpisodeButtonLinkage = "episode2Button";
            rightEpisodeButtonLinkage = "episode3Button";
         }
         else if(BattalionMain.EPISODE == BattalionContext.EPISODE_EPISODE2)
         {
            leftEpisodeButtonLinkage = "episode1Button";
            if(VengeanceStatus.hasBeenReleased())
            {
               rightEpisodeButtonLinkage = "episode3Button";
            }
            else
            {
               rightEpisodeButtonLinkage = "episode3Button_notReleased";
            }
         }
         else
         {
            leftEpisodeButtonLinkage = "episode1Button";
            rightEpisodeButtonLinkage = "episode2Button";
         }
         ep1Class = null;
         try
         {
            ep1Class = getDefinitionByName(leftEpisodeButtonLinkage) as Class;
         }
         catch(e:Error)
         {
         }
         leftEpisodeButton = new VistaButton("",ep1Class);
         addChild(leftEpisodeButton);
         leftEpisodeButton.height = 75;
         leftEpisodeButton.width = 110;
         leftEpisodeButton.addEventListener(MouseEvent.CLICK,openLeftEpisodeURL);
         leftEpisodeButton.x = 3;
         leftEpisodeButton.y = 197;
         ep2Class = null;
         try
         {
            ep2Class = getDefinitionByName(rightEpisodeButtonLinkage) as Class;
         }
         catch(e:Error)
         {
         }
         rightEpisodeButton = new VistaButton("",ep2Class);
         addChild(rightEpisodeButton);
         rightEpisodeButton.height = leftEpisodeButton.height;
         rightEpisodeButton.width = leftEpisodeButton.width;
         rightEpisodeButton.x = BattalionMain.WIDTH - rightEpisodeButton.width - leftEpisodeButton.x;
         rightEpisodeButton.y = leftEpisodeButton.y;
         if(rightEpisodeButtonLinkage == "episode3Button_notReleased")
         {
            rightEpisodeButton.enabled = false;
            rightEpisodeButton.mouseEnabled = false;
            rightEpisodeButton.alpha = 0.5;
         }
         else
         {
            rightEpisodeButton.addEventListener(MouseEvent.CLICK,openRightEpisodeURL);
         }
         prevButton = new TileSheetButton("previousMissionButton");
         prevButton.x = top.x - prevButton.width - 4;
         prevButton.y = top.y + (top.rHeight - prevButton.height) / 2;
         addChild(prevButton);
         nextButton = new TileSheetButton("nextMissionButton");
         nextButton.x = top.x + top.rWidth + 4;
         nextButton.y = prevButton.y;
         addChild(nextButton);
         medals = new Array();
      }
      
      private function openRightEpisodeURL(a_event:Event) : void
      {
         var url:String = "";
         if(BattalionMain.EPISODE == BattalionContext.EPISODE_EPISODE2)
         {
            url = "http://www.kongregate.com/games/urbansquall/battalion-vengeance";
         }
         else
         {
            url = "http://www.kongregate.com/games/urbansquall/battalion-ghosts";
         }
         navigateToURL(new URLRequest(url),"_new");
      }
      
      private function startHandler(a_event:Event) : void
      {
         var storage:IStorage = null;
         var data:ConfirmMenuData = null;
         if(campaignMenuData.getCampaign().toLowerCase().indexOf("bootcamp") == -1)
         {
            storage = BattalionMain.getStorage();
            if(!storage.getBoolean("attemptedBootcamp",false))
            {
               data = new ConfirmMenuData("We recommend all new recruits go through Bootcamp before starting the Campaign. Do you want to do Bootcamp first?",changeToBootcamp,startGame);
               BattalionMain.MODE_MANAGER.pushMode(MenuManager.confirmMenu,data);
               return;
            }
         }
         startGame();
      }
      
      private function createMinimap(a_y:int) : void
      {
         var mmFrame:BattalionPanel = new BattalionPanel(MINIMAP_WIDTH - 16,64,BattalionPanel.SPOTTED,BattalionPanel.FRAME2,"Mission Preview");
         mmFrame.x = 24;
         mmFrame.y = a_y + 22 + INFO_VERTICAL_OFFSET;
         addChild(mmFrame);
         var mm:Sprite = new Sprite();
         mm.graphics.beginFill(0);
         mm.graphics.drawRect(0,0,MINIMAP_WIDTH,MINIMAP_HEIGHT);
         minimapBitmap = new Bitmap();
         mm.addChild(minimapBitmap);
         var frame:Bitmap = new Bitmap(FrameMaker.createFrame(BitmapLibrary.loadBitmap("frame1"),MINIMAP_WIDTH + 16,MINIMAP_HEIGHT + 16,43,43));
         frame.x = -8;
         frame.y = -8;
         mm.addChild(frame);
         mm.x = mmFrame.x - 9;
         mm.y = mmFrame.y + 22;
         addChild(mm);
      }
      
      public function popped() : void
      {
         if(campaignMenuData.restart)
         {
            return;
         }
         mainMenuButton.removeEventListener(MouseEvent.CLICK,mainMenuHandler);
         startButton.removeEventListener(MouseEvent.CLICK,startHandler);
         parent.removeChild(this);
      }
      
      public function gainFocus() : void
      {
         update();
      }
      
      public function clickNextLevel(a_event:Event) : void
      {
         var campaign:CampaignManager = CampaignManager.getInstance(campaignMenuData.getCampaign());
         var levelName:String = campaign.getLevelName();
         var currentLevel:int = BattalionMain.getStorage().getInt(levelName,0);
         currentLevel++;
         BattalionMain.getStorage().setInt(levelName,currentLevel);
         currentLevel = BattalionMain.getStorage().getInt(levelName,0);
         update();
      }
      
      private function clickBootCamp(a_event:Event) : void
      {
         changeToBootcamp();
      }
      
      private function clickCampaign(a_event:Event) : void
      {
         var storage:IStorage = BattalionMain.getStorage();
         storage.setBoolean("attemptedBootcamp",true);
         var xmlLoader:XMLLoader = BattalionMain.getXMLLoader();
         var battalion:XML = xmlLoader.get(BattalionMain.XML_NAME);
         BattalionMain.MODE_MANAGER.switchMode(MenuManager.campaignMenu,new CampaignMenuData("Campaign"));
      }
      
      private function drawMedals() : void
      {
         var medalContainer:Sprite = null;
         var medalBackground:Bitmap = null;
         var medal:TileSheet = null;
         var type:String = null;
         for(var z:int = 0; z < medals.length; z++)
         {
            medals[z].parent.removeChild(medals[z]);
         }
         medals.splice(0);
         var campaign:CampaignManager = CampaignManager.getInstance(campaignMenuData.getCampaign());
         var numLevels:int = campaign.numLevels();
         var medalWidth:int = 35;
         var medalPadding:int = 8;
         var spaceNeeded:int = numLevels * medalWidth + (numLevels - 1) * medalPadding;
         var startingX:int = BattalionMain.WIDTH / 2 - spaceNeeded / 2;
         var maxUnlockedLevel:int = BattalionMain.getStorage().getInt(campaign.getCompleteName(),0);
         var currentLevel:int = BattalionMain.getStorage().getInt(campaign.getLevelName(),0);
         for(var i:int = 0; i < numLevels; i++)
         {
            medalContainer = new Sprite();
            medalBackground = new Bitmap(BitmapLibrary.loadBitmap("medalBackground"));
            medalBackground.name = "background";
            medalContainer.addChild(medalBackground);
            medal = TileSheetManager.getInstance().get("medal");
            type = "locked";
            if(i < maxUnlockedLevel)
            {
               type = BattalionMain.getStorage().getString(campaign.getMapURL(i) + "_medal","bronze");
            }
            if(i == maxUnlockedLevel)
            {
               type = "unlocked";
            }
            if(type != null)
            {
               medal.playAnimation(type);
            }
            medal.x = 10;
            medal.y = 11;
            medalContainer.x = startingX;
            medalContainer.y = 131;
            if(i != currentLevel)
            {
               medalBackground.visible = false;
            }
            if(i <= maxUnlockedLevel)
            {
               medalContainer.addEventListener(MouseEvent.CLICK,clickMedal,false,0,true);
            }
            medalContainer.addChild(medal);
            addChild(medalContainer);
            startingX += medalWidth + medalPadding;
            medals.push(medalContainer);
         }
      }
      
      public function clickPreviousLevel(a_event:Event) : void
      {
         var campaign:CampaignManager = CampaignManager.getInstance(campaignMenuData.getCampaign());
         var currentLevel:* = BattalionMain.getStorage().getInt(campaign.getLevelName(),0);
         currentLevel--;
         BattalionMain.getStorage().setInt(campaign.getLevelName(),currentLevel);
         update();
      }
      
      public function pushed(a_container:DisplayObjectContainer, a_data:ModeData) : void
      {
         campaignMenuData = a_data as CampaignMenuData;
         BattalionMain.getStorage().setInt("bootcamp_complete",10);
         if(!SoundSystem.instance.isPlaying("background") && BattalionMain.EPISODE != BattalionContext.EPISODE_ARENA)
         {
            SoundSystem.instance.createLoop("background",AssetLibrary.createSound("UIWAV"));
         }
         if(campaignMenuData.restart)
         {
            startHandler(null);
         }
         else
         {
            update();
            mainMenuButton.addEventListener(MouseEvent.CLICK,mainMenuHandler);
            startButton.addEventListener(MouseEvent.CLICK,startHandler);
            a_container.addChild(this);
            if(campaignMenuData.getCampaign().toLowerCase().indexOf("bootcamp") >= 0)
            {
               m_difficultyPanel.visible = false;
               m_difficultyPanel.changeSelection(Controller.MEDIUM);
               rightEpisodeButton.visible = false;
               leftEpisodeButton.visible = false;
               bootCampButton.visible = false;
               campaignButton.visible = true;
            }
            else
            {
               m_difficultyPanel.visible = true;
               rightEpisodeButton.visible = true;
               leftEpisodeButton.visible = true;
               bootCampButton.visible = true;
               campaignButton.visible = false;
            }
            if(BattalionMain.IS_ARENA)
            {
               bootCampButton.visible = false;
               campaignButton.visible = false;
            }
         }
      }
      
      public function update() : void
      {
         var campaign:CampaignManager = CampaignManager.getInstance(campaignMenuData.getCampaign());
         var maxUnlockedLevel:int = BattalionMain.getStorage().getInt(campaign.getCompleteName(),0);
         var currentLevel:int = BattalionMain.getStorage().getInt(campaign.getLevelName(),0);
         var numLevels:int = campaign.numLevels();
         if(currentLevel == 0)
         {
            prevButton.removeEventListener(MouseEvent.CLICK,clickPreviousLevel);
            prevButton.disable();
         }
         else
         {
            prevButton.addEventListener(MouseEvent.CLICK,clickPreviousLevel);
            prevButton.enable();
         }
         if(currentLevel == numLevels - 1 || currentLevel >= maxUnlockedLevel)
         {
            nextButton.removeEventListener(MouseEvent.CLICK,clickNextLevel);
            nextButton.disable();
         }
         else
         {
            nextButton.addEventListener(MouseEvent.CLICK,clickNextLevel);
            nextButton.enable();
         }
         var bitmapName:String = campaign.getHeaderBackground();
         header.bitmapData = BitmapLibrary.loadBitmap(campaign.getHeaderBackground());
         chapter.text = campaign.getName(currentLevel);
         chapter.x = (BattalionMain.WIDTH - chapter.width) / 2;
         missionText.text = campaign.getBrief(currentLevel);
         minimapBitmap.bitmapData = null;
         if(minimap != null)
         {
            minimap.dispose();
         }
         minimap = null;
         xmlLoader.addEventListener(Event.COMPLETE,xmlHandler);
         xmlLoader.add(campaign.getMapURL(currentLevel),campaign.getMapName(currentLevel));
         xmlLoader.load();
         drawMedals();
      }
      
      private function xmlHandler(e:Event) : void
      {
         var map:Map = null;
         var nums:Object = null;
         xmlLoader.removeEventListener(Event.COMPLETE,xmlHandler);
         var campaign:CampaignManager = CampaignManager.getInstance(campaignMenuData.getCampaign());
         var currentLevel:int = BattalionMain.getStorage().getInt(campaign.getLevelName(),0);
         var level:XML = xmlLoader.get(campaign.getMapName(currentLevel));
         if(level != null)
         {
            map = new Map(level,campaign.getMapURL(currentLevel),campaign.getMapName(currentLevel));
            minimap = map.generateMiniMap();
            minimapBitmap.bitmapData = minimap;
            var previewScale:Number = Math.min(1,(MINIMAP_WIDTH - 8) / minimap.width,(MINIMAP_HEIGHT - 8) / minimap.height);
            minimapBitmap.scaleX = previewScale;
            minimapBitmap.scaleY = previewScale;
            minimapBitmap.x = (MINIMAP_WIDTH - minimapBitmap.width) / 2;
            minimapBitmap.y = (MINIMAP_HEIGHT - minimapBitmap.height) / 2;
            nums = map.getNums();
         }
      }
      
      private function openLeftEpisodeURL(a_event:Event) : void
      {
         var url:String = "";
         if(BattalionMain.EPISODE == BattalionContext.EPISODE_EPISODE2)
         {
            url = "http://www.kongregate.com/games/urbansquall/battalion-nemesis";
         }
         else
         {
            url = "http://www.kongregate.com/games/urbansquall/battalion-nemesis";
         }
         navigateToURL(new URLRequest(url),"_new");
      }
      
      private function clickMedal(a_event:Event) : void
      {
         var medal:DisplayObject = a_event.currentTarget as DisplayObject;
         var medalIndex:int = medals.indexOf(medal);
         var campaign:CampaignManager = CampaignManager.getInstance(campaignMenuData.getCampaign());
         BattalionMain.getStorage().setInt(campaign.getLevelName(),medalIndex);
         update();
      }
      
      public function loseFocus() : void
      {
      }
      
      protected function drawIcon(a_bitmap:String, a_x:int, a_y:int) : TextField
      {
         var bitmap:Bitmap = new Bitmap(BitmapLibrary.loadBitmap(a_bitmap));
         bitmap.x = a_x - bitmap.width / 2;
         bitmap.y = a_y - bitmap.width / 2;
         var tf:TextField = new DefaultTextField();
         var ttf:TextFormat = new ChatTextFormat();
         ttf.size = 16;
         tf.defaultTextFormat = ttf;
         tf.embedFonts = true;
         tf.filters = [new DropShadowFilter(2)];
         tf.x = a_x + 25;
         tf.y = a_y;
         addChild(bitmap);
         addChild(tf);
         return tf;
      }
      
      private function difficultyChangedCallback(a_newValue:int) : void
      {
         difficulty = a_newValue;
      }
      
      private function changeToBootcamp() : void
      {
         var storage:IStorage = BattalionMain.getStorage();
         storage.setBoolean("attemptedBootcamp",true);
         var xmlLoader:XMLLoader = BattalionMain.getXMLLoader();
         var battalion:XML = xmlLoader.get(BattalionMain.XML_NAME);
         BattalionMain.MODE_MANAGER.switchMode(MenuManager.campaignMenu,new CampaignMenuData("Bootcamp"));
      }
      
      private function mainMenuHandler(a_event:Event) : void
      {
         BattalionMain.MODE_MANAGER.switchMode(MenuManager.mainMenu,null);
      }
      
      private function startGame() : void
      {
         var campaign:CampaignManager = CampaignManager.getInstance(campaignMenuData.getCampaign());
         var currentLevel:int = BattalionMain.getStorage().getInt(campaign.getLevelName(),0);
         var mapSettingsXML:XML = campaign.getMapSettings(currentLevel);
         mapSettingsXML.@difficulty = difficulty;
         var mapSettings:MapSettings = MapSettings.getFromXML(mapSettingsXML);
         mapSettings.setCampaignName(campaignMenuData.getCampaign());
         mapSettings.setCampaign(currentLevel);
         var gameMenuData:GameMenuData = new GameMenuData(campaign.getMapURL(currentLevel),campaign.getMapName(currentLevel),mapSettings);
         BattalionMain.MODE_MANAGER.createSwitchMode(new GameMenu(),gameMenuData);
      }
   }
}


